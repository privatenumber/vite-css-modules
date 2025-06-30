// https://github.com/vitejs/vite/blob/37af8a7be417f1fb2cf9a0d5e9ad90b76ff211b4/packages/vite/src/node/plugins/css.ts#L185
export const cssModuleRE = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

const moduleCssQuery = '?.module.css';
export const cleanUrl = (url: string) => (
	url.endsWith(moduleCssQuery)
		? url.slice(0, -moduleCssQuery.length)
		: url
);

export const getCssModuleUrl = (url: string) => {
	if (cssModuleRE.test(url)) {
		return url;
	}
	return url + moduleCssQuery;
};
