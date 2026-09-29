// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluUI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluUI", targets: ["MonEluUI"]),
    ],
    targets: [
        .target(name: "MonEluUI"),
        .testTarget(name: "MonEluUITests", dependencies: ["MonEluUI"]),
    ]
)
