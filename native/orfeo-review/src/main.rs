//! Opens the Microsoft Store's own "Rate and review" window over Orfeo.
//!
//! A separate little program rather than part of the app: outside the Store
//! build (no Store identity) Windows' review service freezes and then crashes
//! the process that asked, and Orfeo must never close because of a review.
//! Run by electron/main.ts with Orfeo's window handle; the answer is the exit
//! code: 0 rated, 1 closed without rating, 2 no network, 3 couldn't open.

#![windows_subsystem = "windows"]

use windows::core::Interface;
use windows::Services::Store::{StoreContext, StoreRateAndReviewResult, StoreRateAndReviewStatus};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::IInitializeWithWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, MsgWaitForMultipleObjects, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, QS_ALLINPUT,
};
use windows_future::{AsyncStatus, IAsyncOperation};

fn open(owner: usize) -> windows::core::Result<IAsyncOperation<StoreRateAndReviewResult>> {
    let ctx = StoreContext::GetDefault()?;
    // A desktop app must tell the Store which window to place it over
    unsafe { ctx.cast::<IInitializeWithWindow>()?.Initialize(HWND(owner as *mut _))?; }
    ctx.RequestRateAndReviewAppAsync()
}

fn run(owner: usize) -> windows::core::Result<StoreRateAndReviewStatus> {
    // The review window needs a thread that handles window messages
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?; }
    let op = open(owner)?;
    while op.Status()? == AsyncStatus::Started {
        unsafe {
            let mut msg = MSG::default();
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            MsgWaitForMultipleObjects(None, false, 100, QS_ALLINPUT);
        }
    }
    op.GetResults()?.Status()
}

fn main() {
    let owner = std::env::args().nth(1).and_then(|a| a.parse::<usize>().ok()).unwrap_or(0);
    std::process::exit(match run(owner) {
        Ok(StoreRateAndReviewStatus::Succeeded) => 0,
        Ok(StoreRateAndReviewStatus::CanceledByUser) => 1,
        Ok(StoreRateAndReviewStatus::NetworkError) => 2,
        _ => 3,
    })
}
