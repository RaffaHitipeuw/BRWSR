#![allow(dead_code)]

pub struct StartupProfiler {
    start_time: std::time::Instant,
}

impl StartupProfiler {
    pub fn new() -> Self {
        Self {
            start_time: std::time::Instant::now(),
        }
    }

    #[allow(dead_code)]
    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }
}
