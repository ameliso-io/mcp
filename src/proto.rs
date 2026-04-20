pub mod ameliso_v1 {
    // tonic-build writes to OUT_DIR; the file is named after the proto package.
    include!(concat!(env!("OUT_DIR"), "/ameliso.v1.rs"));
}
