import path from 'node:path';
import { type Plugin } from 'vite';

export const injectIdPlugin = (): Plugin => ({
    name: 'inject-id-plugin',
    transform: (code, id) => {
        if (path.extname(id.split('?')[0]!) !== '.css') {
            return;
        }
        return `:root { file: "${id}"; }\n${code}`;
    },
});
