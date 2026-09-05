// Temporary file to check cfg settings at compile time
fn main() {
    #[cfg(not(feature = "unstable"))]
    println!("unstable feature: DISABLED (guard IS compiled)");
    #[cfg(feature = "unstable")]
    println!("unstable feature: ENABLED (guard NOT compiled)");
    
    println!("target_os: {}", std::env::consts::OS);
    println!("target_arch: {}", std::env::consts::ARCH);
}
