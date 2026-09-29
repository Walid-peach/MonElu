// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluAccount",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluAccount", targets: ["MonEluAccount"]),
    ],
    targets: [
        .target(name: "MonEluAccount"),
        .testTarget(name: "MonEluAccountTests", dependencies: ["MonEluAccount"]),
    ]
)
