# Nodeos mocker

## Implemented apis:

    http api:

    - /v1/chain/get_info
    - /v1/chain/get_block

    websocket:

    - state history block read protocol

# Quickstart

    # install deps
    yarn

    # compile
    yarn build

    # run mocker
    cd build
    node build/shipMocker.js