# Quickstart

    # install deps
    yarn

    # compile
    npm run build

    # open mocker
    cd build
    node shipMocker.js run --help

    # example
    node shipMocker.js run 1 10000

    # to change head block num
    curl -X POST \
        -H 'Content-Type: application/json' \
        -d '{"method": "setBlock", "args": {"num": 10}}' \
        http://localhost:6970/set_block
