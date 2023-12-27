import cloneDeep from "lodash.clonedeep";

enum Opcode {
    SET,
    DELETE,
}

type Delta = {
    opcode: Opcode;
    keys: any[];
    value?: any;
}

export type MapLevel = Map<any, any>;

function genericApplyDelta(delta: Delta, root: MapLevel): void {
    let currentLevel = root;
    const keysLength = delta.keys.length;

    for (let i = 0; i < keysLength; i++) {
        const key = delta.keys[i];

        if (i === keysLength - 1) {
            switch (delta.opcode) {
                case Opcode.SET:
                    currentLevel.set(key, i === keysLength - 1 ? delta.value : new Map());
                    break;
                case Opcode.DELETE:
                    currentLevel.delete(key);
                    break;
            }
        } else {
            if (!currentLevel.has(key)) {
                currentLevel.set(key, new Map());
            }
            currentLevel = currentLevel.get(key);
        }
    }
}

export class BufferedMap<K, V> {
    private rootMap = new Map<K, MapLevel>();
    private deltas: Delta[] = [];

    private applyDelta(delta: Delta): void {
        genericApplyDelta(delta, this.rootMap);
    }

    private getFromRoot(keys: K[]): V | MapLevel | undefined {
        let currentLevel = this.rootMap;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!currentLevel.has(key)) {
                return undefined;
            }
            if (i === keys.length - 1) {
                // @ts-ignore
                return currentLevel.get(key);
            }
            currentLevel = currentLevel.get(key);
        }
        return undefined;
    }

    get(keys: K[]): V | MapLevel | undefined {

        // Check for uncommitted deltas
        const relevantDeltas: Delta[] = [];
        for (const delta of this.deltas) {
            if (this.areKeysIncluded(keys, delta.keys)) {
                if (this.areKeysEqual(delta.keys, keys)) {
                    if (delta.opcode === Opcode.SET) {
                        return delta.value;
                    } else if (delta.opcode === Opcode.DELETE) {
                        return undefined; // Key has been marked for deletion
                    }
                }

                // case where user requested a MapLevel and
                // we also have a uncommited delta modifying it
                relevantDeltas.push(cloneDeep(delta));
            }
        }

        // clone root level and use has base
        const rootLevel = this.getFromRoot(keys);
        if (relevantDeltas.length > 0) {
            const synthLevel = rootLevel ? cloneDeep(rootLevel) : new Map();
            for (const delta of relevantDeltas) {
                const relativeKeys = delta.keys.slice(keys.length);
                genericApplyDelta({
                    ...delta,
                    keys: relativeKeys
                }, synthLevel);
            }
            return synthLevel;
        }

        return rootLevel;
    }

    private areKeysIncluded(keys1: K[], keys2: K[]): boolean {
        if (keys1.length > keys2.length) {
            return false;
        }
        for (let i = 0; i < keys1.length; i++) {
            if (keys1[i] !== keys2[i]) {
                return false;
            }
        }
        return true;
    }

    private areKeysEqual(keys1: K[], keys2: K[]): boolean {
        if (keys1.length !== keys2.length) {
            return false;
        }
        for (let i = 0; i < keys1.length; i++) {
            if (keys1[i] !== keys2[i]) {
                return false;
            }
        }
        return true;
    }

    set(keys: K[], value: V): void {
        this.deltas.push({ opcode: Opcode.SET, keys: keys, value: value });
    }

    delete(keys: K[]): void {
        this.deltas.push({ opcode: Opcode.DELETE, keys: keys });
    }

    commit(): void {
        for (const delta of this.deltas) {
            this.applyDelta(delta);
        }
        this.deltas = [];
    }

    discard(): void {
        this.deltas = [];
    }
}