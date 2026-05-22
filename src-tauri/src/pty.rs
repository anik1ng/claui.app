use std::io::{Read, Write};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};

/// Owns one PTY and its child process. Output bytes are delivered to a
/// caller-supplied sink on a reader thread; child exit is signalled once.
pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

impl PtySession {
    /// Spawn `program` in a `cols`x`rows` PTY. `on_output` is called with each
    /// output chunk on a reader thread; `on_exit` is called once with the exit
    /// code after the child terminates.
    pub fn spawn<O, E>(
        program: &str,
        args: &[&str],
        cwd: Option<&str>,
        cols: u16,
        rows: u16,
        on_output: O,
        on_exit: E,
    ) -> anyhow::Result<Self>
    where
        O: Fn(&[u8]) + Send + 'static,
        E: FnOnce(i32) + Send + 'static,
    {
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

        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break, // EOF or error
                    Ok(n) => on_output(&buf[..n]),
                }
            }
            let code = child
                .wait()
                .map(|status| status.exit_code() as i32)
                .unwrap_or(-1);
            on_exit(code);
        });

        Ok(Self {
            writer,
            master: pair.master,
            killer,
        })
    }

    pub fn write(&mut self, data: &[u8]) -> anyhow::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> anyhow::Result<()> {
        self.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn kill(&mut self) {
        let _ = self.killer.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[test]
    fn streams_output_and_signals_exit() {
        let out = Arc::new(Mutex::new(Vec::<u8>::new()));
        let exited = Arc::new(AtomicBool::new(false));
        let out_sink = out.clone();
        let exit_flag = exited.clone();

        let _session = PtySession::spawn(
            "/bin/echo",
            &["hello"],
            None,
            80,
            24,
            move |bytes| out_sink.lock().unwrap().extend_from_slice(bytes),
            move |_code| exit_flag.store(true, Ordering::SeqCst),
        )
        .expect("spawn echo");

        // `echo` writes "hello" then exits; wait for the reader thread.
        for _ in 0..100 {
            if exited.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(exited.load(Ordering::SeqCst), "on_exit should have fired");
        let text = String::from_utf8_lossy(&out.lock().unwrap()).to_string();
        assert!(text.contains("hello"), "expected echoed output, got {text:?}");
    }
}
