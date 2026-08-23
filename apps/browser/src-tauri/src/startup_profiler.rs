


use serde::{Deserialize, Serialize};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// High-resolution startup trace event
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct StartupEvent {
    pub phase: String,
    pub timestamp_ms: u64,
    pub duration_ms: Option<u64>,
    pub detail: Option<String>,
}

/// Complete startup trace
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct StartupTrace {
    pub events: Vec<StartupEvent>,
    pub total_ms: u64,
    pub phase_breakdown: std::collections::HashMap<String, u64>,
}

/// Startup profiler - measures startup phases
pub struct StartupProfiler {
    start_time: Instant,
    start_epoch_ms: u64,
    events: Vec<StartupEvent>,
    phase_starts: std::collections::HashMap<String, Instant>,
}

impl StartupProfiler {
    pub fn new() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            start_time: Instant::now(),
            start_epoch_ms: now,
            events: Vec::new(),
            phase_starts: std::collections::HashMap::new(),
        }
    }

    /// Get elapsed time since profiler creation
    fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }

    /// Record an event
    pub fn event(&mut self, phase: &str, detail: Option<&str>) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let duration = self.phase_starts.get(phase).map(|start| {
            start.elapsed().as_millis() as u64
        });

        self.events.push(StartupEvent {
            phase: phase.to_string(),
            timestamp_ms: now,
            duration_ms: duration,
            detail: detail.map(|s| s.to_string()),
        });

        log::info!("[STARTUP] {} +{}ms{}", phase, self.elapsed_ms(),
            detail.map(|d| format!(" - {}", d)).unwrap_or_default());
    }

    /// Mark phase start
    pub fn phase_start(&mut self, phase: &str) {
        self.phase_starts.insert(phase.to_string(), Instant::now());
        self.event(phase, Some("START"));
    }

    /// Mark phase end
    pub fn phase_end(&mut self, phase: &str, detail: Option<&str>) {
        if let Some(start) = self.phase_starts.remove(phase) {
            let duration = start.elapsed().as_millis() as u64;
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            self.events.push(StartupEvent {
                phase: phase.to_string(),
                timestamp_ms: now,
                duration_ms: Some(duration),
                detail: detail.map(|s| s.to_string()),
            });

            log::info!("[STARTUP] {} completed in {}ms{}", phase, duration,
                detail.map(|d| format!(" - {}", d)).unwrap_or_default());
        }
    }

    /// Get complete trace
    pub fn finish(&self) -> StartupTrace {
        let total_ms = self.start_time.elapsed().as_millis() as u64;

        
        let mut phase_breakdown = std::collections::HashMap::new();
        for event in &self.events {
            if let Some(dur) = event.duration_ms {
                *phase_breakdown.entry(event.phase.clone()).or_insert(0) += dur;
            }
        }

        StartupTrace {
            events: self.events.clone(),
            total_ms,
            phase_breakdown,
        }
    }
}

impl Default for StartupProfiler {
    fn default() -> Self {
        Self::new()
    }
}
