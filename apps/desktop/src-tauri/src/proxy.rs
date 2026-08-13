use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

/// Lumina 本地反向代理：对外监听固定端口，转发到桌面端后端服务。
///
/// 纯 std 实现，零额外依赖。每次连接只处理一个请求（响应后关闭），
/// 对 fetch / XMLHttpRequest 客户端完全兼容。
pub const PROXY_ADDR: &str = "127.0.0.1:3002";
pub const TARGET_ADDR: &str = "127.0.0.1:3001";

pub fn start() {
    std::thread::spawn(|| match TcpListener::bind(PROXY_ADDR) {
        Ok(listener) => {
            println!("[lumina-proxy] listening on {PROXY_ADDR} -> {TARGET_ADDR}");
            for stream in listener.incoming() {
                if let Ok(s) = stream {
                    std::thread::spawn(|| handle_client(s));
                }
            }
        }
        Err(e) => eprintln!("[lumina-proxy] bind {PROXY_ADDR} failed: {e}"),
    });
}

fn handle_client(mut client: TcpStream) {
    let _ = client.set_read_timeout(Some(Duration::from_secs(30)));

    // 读取请求头（直到空行）
    let mut head = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let n = match client.read(&mut buf) {
            Ok(n) => n,
            Err(_) => return,
        };
        if n == 0 {
            return;
        }
        head.extend_from_slice(&buf[..n]);
        if find_header_end(&head).is_some() {
            break;
        }
    }

    let header_end = match find_header_end(&head) {
        Some(p) => p,
        None => return,
    };
    let header_bytes = &head[..header_end];
    let headers = match std::str::from_utf8(header_bytes) {
        Ok(h) => h,
        Err(_) => return,
    };

    // 计算 body 长度（Content-Length），读取剩余
    let content_length = parse_content_length(headers).unwrap_or(0);
    let mut body = head[header_end..].to_vec();
    while body.len() < content_length {
        let n = match client.read(&mut buf) {
            Ok(n) => n,
            Err(_) => return,
        };
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }

    // 连接上游并转发
    let Ok(mut upstream) = TcpStream::connect(TARGET_ADDR) else {
        let _ = write_simple_error(&mut client, 502, "Bad Gateway", "cannot reach Lumina backend");
        return;
    };
    let _ = upstream.set_read_timeout(Some(Duration::from_secs(120)));
    let _ = upstream.set_write_timeout(Some(Duration::from_secs(120)));

    let mut request = Vec::new();
    request.extend_from_slice(header_bytes);
    request.extend_from_slice(&body);
    if upstream.write_all(&request).is_err() || upstream.flush().is_err() {
        let _ = write_simple_error(&mut client, 502, "Bad Gateway", "upstream write failed");
        return;
    }

    // 读取上游响应并写回客户端
    let mut response = Vec::new();
    loop {
        let n = match upstream.read(&mut buf) {
            Ok(n) => n,
            Err(_) => break,
        };
        if n == 0 {
            break;
        }
        response.extend_from_slice(&buf[..n]);
        if let Some(hl) = find_header_end(&response) {
            if let Ok(text) = std::str::from_utf8(&response[..hl]) {
                if let Some(cl) = parse_content_length(text) {
                    if response.len() >= hl + cl {
                        break;
                    }
                } else if text.starts_with("HTTP/") && text.contains("chunked") {
                    if text.to_ascii_lowercase().contains("transfer-encoding: chunked") && response.ends_with(b"0\r\n\r\n") {
                        break;
                    }
                }
            }
        }
    }

    let _ = client.write_all(&response);
    let _ = client.flush();
}

fn find_header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == b"\r\n\r\n").map(|p| p + 4)
}

fn parse_content_length(headers: &str) -> Option<usize> {
    for line in headers.lines() {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                if let Ok(n) = v.trim().parse::<usize>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

fn write_simple_error(client: &mut TcpStream, status: u16, reason: &str, msg: &str) -> std::io::Result<()> {
    let body = format!("{{\"error\":\"{msg}\"}}");
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    client.write_all(head.as_bytes())?;
    client.write_all(body.as_bytes())?;
    client.flush()
}
