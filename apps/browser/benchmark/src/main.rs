// EduOS Browser Benchmark - CLI Entry Point
//
// Usage:
//   cargo run --bin eduos-benchmark -- <workload> <condition> <run_count>
//
// Examples:
//   cargo run --bin eduos-benchmark -- lightweight treatment 3
//   cargo run --bin eduos-benchmark -- mixed control 5
//   cargo run --bin eduos-benchmark -- heavy treatment 3

use std::env;
use eduos_benchmark::run_benchmark_cli;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.is_empty() || args[0] == "--help" || args[0] == "-h" {
        println!("EduOS Browser Benchmark Suite");
        println!();
        println!("Usage:");
        println!("  cargo run --bin eduos-benchmark -- <workload> [condition] [run_count]");
        println!();
        println!("Arguments:");
        println!("  workload    - lightweight | mixed | heavy (default: lightweight)");
        println!("  condition   - control | treatment (default: treatment)");
        println!("  run_count   - number of runs (default: 3)");
        println!();
        println!("Workloads:");
        println!("  lightweight - 5 static pages");
        println!("  mixed       - 10 mixed complexity pages");
        println!("  heavy       - 10 heavy pages (video, JS-heavy)");
        println!();
        println!("Conditions:");
        println!("  control     - Lifecycle manager disabled");
        println!("  treatment   - Lifecycle manager enabled");
        println!();
        println!("Examples:");
        println!("  cargo run --bin eduos-benchmark -- lightweight treatment 3");
        println!("  cargo run --bin eduos-benchmark -- mixed control 5");
        return;
    }

    match run_benchmark_cli(&args) {
        Ok(()) => {}
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}
