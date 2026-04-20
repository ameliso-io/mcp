fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure().compile_protos(
        &[
            "proto/ameliso/v1/types.proto",
            "proto/ameliso/v1/service.proto",
        ],
        &["proto"],
    )?;
    Ok(())
}
