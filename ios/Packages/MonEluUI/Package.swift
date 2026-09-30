// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluUI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluUI", targets: ["MonEluUI"]),
    ],
    dependencies: [
        .package(path: "../MonEluCore"),
    ],
    targets: [
        .target(name: "MonEluUI", dependencies: ["MonEluCore"]),
        .testTarget(name: "MonEluUITests", dependencies: ["MonEluUI", "MonEluCore"]),
    ]
)
