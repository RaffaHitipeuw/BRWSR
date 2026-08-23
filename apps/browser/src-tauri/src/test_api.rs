#[cfg(windows)]
fn test() {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    
    fn _check_env10(_: ICoreWebView2Environment7) {}
    fn _check_wv10(_: ICoreWebView2_10) {}
}
