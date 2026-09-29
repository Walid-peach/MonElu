// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluCore",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluCore", targets: ["MonEluCore"]),
    ],
    targets: [
        .target(name: "MonEluCore"),
        .testTarget(name: "MonEluCoreTests", dependencies: ["MonEluCore"]),
    ]
)
