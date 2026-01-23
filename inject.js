// inject.js
(function() {
    // === 1. 拦截 XMLHttpRequest (Gemini 主要使用这个) ===
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;

    // 劫持 open 以获取 URL
    XHR.open = function(method, url) {
        this._url = url; 
        return open.apply(this, arguments);
    };

    // 劫持 send 以获取响应
    XHR.send = function() {
        this.addEventListener('load', function() {
            // 只过滤 Gemini 的数据接口 batchexecute
            if (this._url && this._url.includes('batchexecute')) {
                try {
                    // 发送给 content.js
                    window.postMessage({
                        type: 'GEMINI_INTERCEPTOR_DATA',
                        payload: this.responseText
                    }, '*');
                } catch (e) {
                    console.error('[Gemini Interceptor] Data forward error:', e);
                }
            }
        });
        return send.apply(this, arguments);
    };

    // === 2. 拦截 Fetch (备用，防止未来 Google 改接口) ===
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = args[0] instanceof Request ? args[0].url : args[0];
        
        if (url && url.includes('batchexecute')) {
            const clone = response.clone();
            clone.text().then(body => {
                window.postMessage({
                    type: 'GEMINI_INTERCEPTOR_DATA',
                    payload: body
                }, '*');
            }).catch(err => console.error(err));
        }
        return response;
    };

    console.log('%c[Gemini Interceptor] Injected Successfully', 'color: #4CAF50; font-weight: bold;');
})();