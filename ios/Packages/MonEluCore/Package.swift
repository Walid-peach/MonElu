// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluCore",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluCore", targets: ["MonEluCore"]),
    ],
    targets: [
        .target(
            name: "MonEluCore",
            // A symlink to data/reference/, the one copy of these tables
            // (ADR-041 §4): the app bundles it rather than keeping its own.
            resources: [.copy("Reference")]
        ),
        .testTarget(name: "MonEluCoreTests", dependencies: ["MonEluCore"]),
    ]
)
