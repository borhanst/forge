use std::process::Command;

fn main() {
    let output = Command::new("ls")
        .arg("-la")
        .output()
        .expect("failed to execute command");

    println!("Status: {}", output.status);

    println!(
        "Stdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );

    println!(
        "Stderr:\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
}