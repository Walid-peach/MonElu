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
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.19.6"),
    ],
    targets: [
        .target(
            name: "MonEluUI",
            dependencies: ["MonEluCore"],
            // Colors.xcassets (the tokens) and Fonts/ (Newsreader, OFL).
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "MonEluUITests",
            dependencies: [
                "MonEluUI",
                "MonEluCore",
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            // Reference images live beside the tests in __Snapshots__.
            exclude: ["__Snapshots__"]
        ),
    ]
)
