// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MonEluAPI",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluAPI", targets: ["MonEluAPI"]),
    ],
    dependencies: [
        .package(path: "../MonEluCore"),
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.2"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.3.1"),
    ],
    targets: [
        .target(
            name: "MonEluAPI",
            dependencies: [
                "MonEluCore",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
            ]
        ),
        .testTarget(
            name: "MonEluAPITests",
            dependencies: [
                "MonEluAPI",
                "MonEluCore",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            // Responses recorded from the production API.
            resources: [.copy("Fixtures")]
        ),
    ]
)
