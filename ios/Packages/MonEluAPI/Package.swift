// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluAPI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluAPI", targets: ["MonEluAPI"]),
    ],
    targets: [
        .target(name: "MonEluAPI"),
        .testTarget(name: "MonEluAPITests", dependencies: ["MonEluAPI"]),
    ]
)
