import { pick, remove, set } from 'dot-object';
import Tab from './tab';

export interface Options {
  statesPaths?: string[];
  key?: string;
  saveStoreIndividually?: boolean;

  onBeforeReplace?(state: any): any;

  onBeforeSave?(state: any): any;
}

export default function(options?: Options) {
  const tab = new Tab(window);
  let key: string = 'vuex-multi-tab';
  const keyStoreKeys: string = 'vuex-storekeys';
  const prefixStoreKey: string = 'vuex-store-';
  let saveStoreIndividually = false;
  let statesPaths: string[] = [];
  let onBeforeReplace = (state: any) => state;
  let onBeforeSave = (state: any) => state;

  if (options) {
    key = options.key ? options.key : key;
    saveStoreIndividually = options.saveStoreIndividually ?? false;
    statesPaths = options.statesPaths ? options.statesPaths : statesPaths;
    onBeforeReplace = options.onBeforeReplace || onBeforeReplace;
    onBeforeSave = options.onBeforeSave || onBeforeSave;
  }

  function filterStates(state: { [key: string]: any }): { [key: string]: any } {
    const result = {};
    statesPaths.forEach(statePath => {
      set(statePath, pick(statePath, state), result);
    });
    return result;
  }

  /**
   * simple object deep clone method
   * @param obj
   */
  function cloneObj(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(val => cloneObj(val));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.keys(obj).reduce((r: any, objKey) => {
        r[objKey] = cloneObj(obj[objKey]);
        return r;
      }, {});
    }
    return obj;
  }

  function mergeState(oldState: any, newState: object) {
    // if whole state is to be replaced then do just that
    if (statesPaths.length === 0) return { ...newState };

    // else clone old state
    const merged: any = cloneObj(oldState);

    // and replace only specified paths
    statesPaths.forEach(statePath => {
      const newValue = pick(statePath, newState);
      // remove value if it doesn't exist, overwrite otherwise
      if (typeof newValue === 'undefined') remove(statePath, merged);
      else set(statePath, newValue, merged);
    });
    return merged;
  }

  if (!tab.storageAvailable()) {
    throw new Error('Local storage is not available!');
  }

  function replaceState(store: any, state: object) {
    const adjustedState = onBeforeReplace(state);

    if (adjustedState) {
      store.replaceState(mergeState(store.state, adjustedState));
    }
  }

  const singleStoreState = (store: any) => {
    // First time, fetch state from local storage
    tab.fetchState(key, (state: object) => {
      replaceState(store, state);
    });

    // Add event listener to the state saved in local storage
    tab.addEventListener(key, (state: object) => {
      replaceState(store, state);
    });

    store.subscribe((mutation: MutationEvent, state: object) => {
      let toSave = state;

      // Filter state
      if (statesPaths.length > 0) {
        toSave = filterStates(state);
      }

      toSave = onBeforeSave(toSave);

      // Save state in local storage
      if (toSave) {
        tab.saveState(key, toSave);
      }
    });
  };

  const individualStoreState = (store: any) => {
    // First time, fetch state from local storage
    replaceState(store, {
      ...tab.getAllStoreKeys(keyStoreKeys).map(storeKey => {
        return {
          [storeKey.replace(prefixStoreKey, '')]: {
            ...tab.fetchStoreState(storeKey),
          },
        };
      }),
    });

    // Add event listener to the state saved in local storage
    tab.getAllStoreKeys(keyStoreKeys).forEach(storeKey => {
      tab.addStorageEventListener(storeKey, () => {
        replaceState(store, {
          ...tab.getAllStoreKeys(keyStoreKeys).map(storeKey1 => {
            return {
              [storeKey1.replace(prefixStoreKey, '')]: {
                ...tab.fetchStoreState(storeKey1),
              },
            };
          }),
        });
      });
    });

    store.subscribe((mutation: MutationEvent, state: object) => {
      let toSave = state;

      // Filter state
      if (statesPaths.length > 0) {
        toSave = filterStates(state);
      }

      toSave = onBeforeSave(toSave);

      // Save state in local storage
      if (toSave) {
        const storeKeys = Object.keys(toSave);
        tab.saveStoreKeys(keyStoreKeys, storeKeys);
        // eslint-disable-next-line no-restricted-syntax
        for (const storeKey of storeKeys) {
          tab.saveStoreState(storeKey, toSave);
        }
      }
    });
  };

  return saveStoreIndividually ? individualStoreState : singleStoreState;
}
