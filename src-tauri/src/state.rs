use std::collections::HashMap;
use std::sync::Mutex;

use crate::pty::PtySession;

/// Process-wide state: the live terminal registry, the current project path,
/// and a monotonic id counter.
pub struct AppState {
    inner: Mutex<Inner>,
    /// Project + tab the user should land on when they click an OS
    /// notification. Written by `stash_pending_activation` just before the
    /// banner is shown; consumed (and cleared) by `activate_pending` when the
    /// window comes to front.
    pub pending_activation: Mutex<Option<(String, String)>>,
}

struct Inner {
    terminals: HashMap<u32, PtySession>,
    next_id: u32,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            inner: Mutex::new(Inner {
                terminals: HashMap::new(),
                next_id: 1,
            }),
            pending_activation: Mutex::new(None),
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

    /// Remove a terminal from the registry. Dropping the `PtySession` kills
    /// its child process (see `PtySession`'s `Drop` impl). A no-op if `id`
    /// is unknown.
    pub fn close(&self, id: u32) {
        self.inner.lock().unwrap().terminals.remove(&id);
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

    #[test]
    fn close_removes_a_terminal() {
        let state = AppState::new();
        let session =
            PtySession::spawn("/bin/echo", &["x"], None, &[], 80, 24, |_| {}, |_| {}).unwrap();
        let id = state.alloc_id();
        state.insert(id, session);
        assert!(state.inner.lock().unwrap().terminals.contains_key(&id));
        state.close(id);
        assert!(!state.inner.lock().unwrap().terminals.contains_key(&id));
    }
}
