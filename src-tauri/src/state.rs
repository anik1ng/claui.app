use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::pty::PtySession;

/// Process-wide state: the live terminal registry, the current project path,
/// and a monotonic id counter.
pub struct AppState {
    inner: Mutex<Inner>,
}

struct Inner {
    terminals: HashMap<u32, PtySession>,
    next_id: u32,
    project: Option<PathBuf>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            inner: Mutex::new(Inner {
                terminals: HashMap::new(),
                next_id: 1,
                project: None,
            }),
        }
    }

    /// Allocate the next terminal id.
    pub fn alloc_id(&self) -> u32 {
        let mut inner = self.inner.lock().unwrap();
        let id = inner.next_id;
        inner.next_id += 1;
        id
    }

    pub fn insert(&self, id: u32, session: PtySession) {
        self.inner.lock().unwrap().terminals.insert(id, session);
    }

    /// Write input bytes to a terminal's PTY, if it exists.
    pub fn write_input(&self, id: u32, data: &[u8]) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(session) = inner.terminals.get_mut(&id) {
            let _ = session.write(data);
        }
    }

    /// Resize a terminal's PTY, if it exists.
    pub fn resize(&self, id: u32, cols: u16, rows: u16) {
        let inner = self.inner.lock().unwrap();
        if let Some(session) = inner.terminals.get(&id) {
            let _ = session.resize(cols, rows);
        }
    }

    pub fn set_project(&self, path: PathBuf) {
        self.inner.lock().unwrap().project = Some(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alloc_id_is_monotonic() {
        let state = AppState::new();
        assert_eq!(state.alloc_id(), 1);
        assert_eq!(state.alloc_id(), 2);
        assert_eq!(state.alloc_id(), 3);
    }
}
