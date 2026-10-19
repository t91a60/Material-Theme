const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function moduleLoader(globals = {}) {
    const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout, queueMicrotask, ...globals });
    const modules = new Map();
    function get(filename) {
        filename = path.resolve(filename);
        if (!modules.has(filename)) modules.set(filename, new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { context, identifier: filename }));
        return modules.get(filename);
    }
    return async filename => {
        const module = get(filename);
        if (module.status === 'unlinked') await module.link((specifier, parent) => get(path.resolve(path.dirname(parent.identifier), specifier)));
        if (module.status !== 'evaluated') await module.evaluate();
        return module.namespace;
    };
};
