# leap-mock
Allows creation of mock Antelope chains for testing of weird block production scenarios, based on two main concepts:

- Jumps: used to set up fork scenarios
- Pauses: used to set up connection drop scenarios

# Table of Contents

1. [Introduction](#leap-mock)
   - [Overview of `leap-mock`](#leap-mock)
   - [Key Concepts: Jumps and Pauses](#leap-mock)

2. [Quickstart](#quickstart)
   - [Running with Docker](#quickstart)
   - [Running with a Cloned Repository](#quickstart)
   - [Control API Port Information](#quickstart)

3. [Practical Example](#practical-example)
   - [Example Use Case: Testing Fork Handling](#practical-example)
   - [Crafting a ChainDescriptor](#practical-example)
   - [ChainDescriptor Parameters and Behavior](#practical-example)

4. [Endpoints](#endpoints)
   - [POST /create_chain](#post-create_chain)
     - [Description and Usage](#post-create_chain)
     - [Request Body and Response Structure](#post-create_chain)

5. [Parameters](#parameters)
   - [Optional Parameters](#optional-parameters)
     - [Details of Optional Parameters](#optional-parameters)
   - [Mandatory Parameters](#mandatory-parameters)
     - [Description of Mandatory Parameters](#mandatory-parameters)

6. [Behavior](#behavior)
   - [Behavior and Functionality of `initializeChain`](#behavior)

7. [Additional Endpoints](#endpoints-1)
   - [POST /restart_chain_network](#post-restart_chain_network)
     - [Description, Request Body, and Responses](#post-restart_chain_network)
   - [POST /destroy_chain](#post-destroy_chain)
     - [Description, Request Body, and Responses](#post-destroy_chain)
   - [POST /start](#post-start)
     - [Description, Request Body, and Responses](#post-start)
   - [POST /stop](#post-stop)
     - [Description, Request Body, and Responses](#post-stop)

8. [Implemented Mock APIs](#implemented-mock-apis)
   - [HTTP API Endpoints](#implemented-mock-apis)
   - [WebSocket Protocols](#implemented-mock-apis)

9. [Testing](#testing)
   - [Integration into Mocha-based Tests](#testing)
   - [Location of Test Scripts](#testing)


# Quickstart

    docker run -d --network=host guilledk/leap-mock

or with the repo cloned:

    npm run build && npm run start

This will serve the control api at port 6970

## Practical example:

Let's say you wanted to test the fork handling machinery of a new state history indexer,
first lets craft a [ChainDescriptor](src/controller.ts#L17) :

```json
{
    "startBlock": 1,
    "endBlock": 10,
    "blockGenStrat": "inorder",
    "jumps": [[5, 3]]
}
```

If used as parameters for the `/create_chain` endpoint this `ChainDescriptor` will create a new chain with block
range 1-10, with hashes of blocks being just a hex of the block number, then if started, when this chain reaches block 5 it will jump back to block 3, simulating a fork.

Remember to start block production the endpoint `/start` has to be called with the `chainId`.

## Endpoints

### POST /create_chain
- **Description**: Initializes a new blockchain instance.
- **Request Body**:
  - `ChainDescriptor`: Object describing the blockchain configuration.
- **Response**: 
  - Success: Object with information about the initialized chain.
  - Error: Error message.

`ChainDescriptor` is an interface used as the input for the `/create_chain` api, which initializes a new blockchain instance.

## Parameters

### Optional Parameters
- `shipPort?: number`
  - The port number for the ship socket connection.
- `httpPort?: number`
  - The port number for the HTTP API socket connection.
- `abi?: ABI`
  - The ABI (Application Binary Interface) for the chain. Defaults to `DEFAULT_ABI` if not provided.
- `chainId?: string`
  - A unique identifier for the chain. A random hash is generated if not provided.
- `startTime?: string`
  - The start time of the blockchain instance in ISO format. Defaults to the next block time if not provided.
- `asapMode?: boolean`
  - If `true`, the chain will operate in ASAP mode, affecting block generation speed.
- `blockGenStrat?: string`
  - Strategy for generating block hashes. Can be `'random'` or `'inorder'`.
- `blocks?: string[][]`
  - Predefined block hashes. If not provided, they are generated based on `blockGenStrat`.
- `jumps?: [number, number][]`
  - An array of tuples representing jumps in the blockchain, each tuple consisting of two numbers.
- `pauses?: [number, number][]`
  - An array of tuples for pauses in the blockchain, where each tuple represents the start and end of a pause. Pause means drop the sockets and wait for x seconds then restart sockets, while keeping production going.

### Mandatory Parameters
- `startBlock: number`
  - The starting block number for the blockchain instance.
- `endBlock: number`
  - The ending block number for the blockchain instance.

## Behavior
- The `initializeChain` function creates a new blockchain instance with the specified configuration.
- If `chainId` is already in use, an error is thrown.
- Random ports are assigned for `shipPort` and `httpPort` if not specified.
- The start time defaults to the next block time if not provided.
- The function sets up block history, network sockets, and other necessary configurations based on the provided parameters.


### POST /restart_chain_network
- **Description**: Restarts the network of a specified blockchain instance.
- **Request Body**:
  - `chainId`: ID of the blockchain instance.
  - `sleepTime` (optional): Time to wait before restarting the network.
- **Response**:
  - Success: Confirmation message (`'ok'`).
  - Error: Error message.

### POST /destroy_chain
- **Description**: Destroys a specified blockchain instance.
- **Request Body**:
  - `chainId`: ID of the blockchain instance to be destroyed.
- **Response**:
  - Success: Confirmation message (`'ok'`).
  - Error: Error message.

### POST /start
- **Description**: Starts the blockchain producer for a specified instance.
- **Request Body**:
  - `chainId`: ID of the blockchain instance.
- **Response**:
  - Success: Confirmation message (`'ok'`).
  - Error: Error message.

### POST /stop
- **Description**: Stops the blockchain producer for a specified instance.
- **Request Body**:
  - `chainId`: ID of the blockchain instance.
- **Response**:
  - Success: Confirmation message (`'ok'`).
  - Error: Error message.

## Implemented mock apis:

    http api:

    - /v1/chain/get_info
    - /v1/chain/get_block

    websocket:

    - state history block read protocol

## Testing:

Check the `tests/` directory to see how to integrate `leap-mock` into `mocha` based tests.