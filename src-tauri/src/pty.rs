use std::io::{Read, Write};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};

/// Owns one PTY, its child process, and a reader thread. Output bytes are
/// delivered through an mpsc channel; input is written to the PTY master.
pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    output: Receiver<Vec<u8>>,
}

impl PtySession {
    /// Spawn `program` with `args` in `cwd` inside a `cols`x`rows` PTY.
    pub fn spawn(
        program: &str,
        args: &[&str],
        cwd: Option<&str>,
        cols: u16,
        rows: u16,
    ) -> anyhow::Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }
        cmd.env("TERM", "xterm-256color");

        let mut child = pair.slave.spawn_command(cmd)?;
        // Drop the slave so the reader sees EOF once the child exits.
        drop(pair.slave);

        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let (tx, rx) = channel::<Vec<u8>>();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF: child exited
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break; // receiver dropped
                        }
                    }
                    Err(_) => break,
                }
            }
            // Reap the child so it does not linger as a zombie.
            let _ = child.wait();
        });

        Ok(Self { writer, master: pair.master, killer, output: rx })
    }

    /// The channel of raw output bytes from the child.
    pub fn output(&self) -> &Receiver<Vec<u8>> {
        &self.output
    }

    pub fn write(&mut self, data: &[u8]) -> anyhow::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> anyhow::Result<()> {
        self.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })?;
        Ok(())
    }

    pub fn kill(&mut self) {
        let _ = self.killer.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn echoes_input_back() {
        let mut session = PtySession::spawn("/bin/cat", &[], None, 80, 24)
            .expect("spawn cat");
        session.write(b"ping\n").expect("write");
        // `cat` echoes its input; collect output until we see it.
        let mut seen = String::new();
        for _ in 0..50 {
            if let Ok(chunk) = session.output().recv_timeout(Duration::from_millis(100)) {
                seen.push_str(&String::from_utf8_lossy(&chunk));
                if seen.contains("ping") {
                    break;
                }
            }
        }
        assert!(seen.contains("ping"), "expected echoed text, got {seen:?}");
        session.kill();
    }
}
