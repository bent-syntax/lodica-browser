// First slice of the Electron -> Rust+CEF move: one window that loads the existing UI.
// Not yet ported: tabs, relay, vault, updater, preload scripts (see desktop/main/*.js).
use cef::*;
use std::cell::RefCell;

wrap_app! {
    struct LodicaApp;

    impl App {
        fn browser_process_handler(&self) -> Option<BrowserProcessHandler> {
            Some(LodicaBrowserProcessHandler::new(RefCell::new(None)))
        }
    }
}

wrap_client! {
    struct LodicaClient;

    impl Client {}
}

wrap_browser_process_handler! {
    struct LodicaBrowserProcessHandler {
        client: RefCell<Option<Client>>,
    }

    impl BrowserProcessHandler {
        fn on_context_initialized(&self) {
            let cmd = command_line_get_global().expect("command line");
            let url = CefString::from(&cmd.switch_value(Some(&CefString::from("url")))).to_string();
            let url = if url.is_empty() { "https://lodica.syntaxya.be/".to_string() } else { url };
            let url = CefString::from(url.as_str());
            let mut client = LodicaClient::new();
            browser_host_create_browser(
                Some(&WindowInfo::default()),
                Some(&mut client),
                Some(&url),
                Some(&BrowserSettings::default()),
                None,
                None,
            );
            *self.client.borrow_mut() = Some(client);
        }
    }
}

fn main() {
    let args = cef::args::Args::new();
    let cmd = args.as_cmd_line().expect("command line");
    let main_args = args.as_main_args();
    let ret = execute_process(Some(main_args), None, std::ptr::null_mut());
    if cmd.has_switch(Some(&CefString::from("type"))) == 1 {
        return; // helper process
    }
    assert_eq!(ret, -1, "cannot execute browser process");
    let mut app = LodicaApp::new();
    let settings = Settings { no_sandbox: 1, ..Default::default() };
    assert_eq!(initialize(Some(main_args), Some(&settings), Some(&mut app), std::ptr::null_mut()), 1);
    run_message_loop();
    shutdown();
}
