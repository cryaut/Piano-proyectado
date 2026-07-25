from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = "http://localhost:3000/"
SHOT = Path("tmp-runtime-smoke.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 920})
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto(URL)
    page.wait_for_load_state("networkidle")

    start = page.get_by_text("Haz clic en la pantalla para empezar")
    if start.count() > 0:
        start.click(timeout=10000)
    else:
        page.mouse.click(20, 20)
    page.evaluate("window.dispatchEvent(new Event('piano-engine-ready'))")

    page.get_by_role("button", name="Key Tester").click()
    page.keyboard.press("KeyZ")
    expect(page.locator("text=qwerty/release · C3").first).to_be_visible(timeout=5000)

    page.keyboard.down("Shift")
    page.keyboard.press("KeyZ")
    page.keyboard.up("Shift")
    expect(page.locator("text=qwerty/release · C#3").first).to_be_visible(timeout=5000)

    page.keyboard.down("Shift")
    page.keyboard.press("KeyC")
    page.keyboard.up("Shift")
    expect(page.get_by_text("UNMAPPED_BLACK_KEY", exact=False)).to_be_visible(timeout=5000)

    page.get_by_role("button", name="Hide").click()
    page.get_by_text("EDITOR", exact=False).click()
    page.wait_for_timeout(350)
    canvas = page.locator("canvas").first
    canvas.wait_for(state="visible", timeout=5000)
    box = canvas.bounding_box()
    assert box, "Editor canvas not found"
    page.mouse.move(box["x"] + 220, box["y"] + 220)
    page.mouse.click(box["x"] + 220, box["y"] + 220)
    expect(page.locator("text=row").first).to_be_visible(timeout=5000)
    page.keyboard.press("+")
    page.keyboard.press("-")
    page.keyboard.press("0")

    page.screenshot(path=str(SHOT), full_page=True)
    browser.close()

    serious_errors = [
        error for error in errors
        if "Failed to load resource" not in error
        and "Failed to get MIDI access" not in error
        and "Web MIDI API" not in error
    ]
    if serious_errors:
        raise AssertionError("\\n".join(serious_errors))

print(f"Runtime smoke passed. Screenshot: {SHOT}")
