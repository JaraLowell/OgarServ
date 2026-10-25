use anyhow::{Context, Result};
use rcgen::{CertificateParams, DnType, KeyPair, SanType};
use rustls::ServerConfig;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_rustls::TlsAcceptor;
use tracing::info;

/// Load TLS material for WSS.
/// Prefers Let's Encrypt names (`fullchain.pem` + `privkey.pem`); falls back to
/// legacy `cert.pem` / `key.pem`; generates a local self-signed pair if neither exists.
pub fn load_or_create_acceptor(
    dir: impl AsRef<Path>,
    cert_name: &str,
    key_name: &str,
) -> Result<TlsAcceptor> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;

    let primary_cert = dir.join(cert_name);
    let primary_key = dir.join(key_name);
    let legacy_cert = dir.join("cert.pem");
    let legacy_key = dir.join("key.pem");

    let (cert_path, key_path) = resolve_paths(
        &primary_cert,
        &primary_key,
        &legacy_cert,
        &legacy_key,
        dir,
        cert_name,
        key_name,
    )?;

    info!(
        cert = %cert_path.display(),
        key = %key_path.display(),
        "loading TLS certificate for WSS"
    );

    let cert_pem = fs::read(&cert_path).with_context(|| format!("read {}", cert_path.display()))?;
    let key_pem = fs::read(&key_path).with_context(|| format!("read {}", key_path.display()))?;

    let mut certs = Vec::new();
    for item in rustls_pemfile::certs(&mut cert_pem.as_slice()) {
        certs.push(item?);
    }
    anyhow::ensure!(
        !certs.is_empty(),
        "no certificates in {} (use Let's Encrypt fullchain.pem)",
        cert_path.display()
    );
    let key = rustls_pemfile::private_key(&mut key_pem.as_slice())?
        .with_context(|| format!("no private key in {}", key_path.display()))?;

    let mut cfg = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    cfg.alpn_protocols = vec![b"http/1.1".to_vec()];

    Ok(TlsAcceptor::from(Arc::new(cfg)))
}

fn resolve_paths(
    primary_cert: &Path,
    primary_key: &Path,
    legacy_cert: &Path,
    legacy_key: &Path,
    dir: &Path,
    cert_name: &str,
    key_name: &str,
) -> Result<(PathBuf, PathBuf)> {
    if primary_cert.exists() && primary_key.exists() {
        return Ok((primary_cert.to_path_buf(), primary_key.to_path_buf()));
    }
    if legacy_cert.exists() && legacy_key.exists() {
        info!(
            "using legacy cert.pem/key.pem — prefer symlinking Let's Encrypt fullchain.pem + privkey.pem"
        );
        return Ok((legacy_cert.to_path_buf(), legacy_key.to_path_buf()));
    }

    // Nothing present — create self-signed under the configured LE-style names
    let cert_path = dir.join(cert_name);
    let key_path = dir.join(key_name);
    info!(
        cert = %cert_path.display(),
        "generating self-signed TLS certificate for WSS (replace with Let's Encrypt symlinks for production)"
    );
    let mut params = CertificateParams::new(vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
    ])?;
    params
        .distinguished_name
        .push(DnType::CommonName, "OgarServ Rust Local");
    params.subject_alt_names.push(SanType::IpAddress(
        std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
    ));
    let key_pair = KeyPair::generate()?;
    let cert = params.self_signed(&key_pair)?;
    fs::write(&cert_path, cert.pem())?;
    fs::write(&key_path, key_pair.serialize_pem())?;
    Ok((cert_path, key_path))
}
