const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set window size
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Visit the app
  console.log('Navigating to localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 120000 });
    // Wait an extra 5 seconds for Next.js to fully render React
    await new Promise(r => setTimeout(r, 5000));
  } catch (e) {
    console.error('Failed to load localhost:3000. Is the dev server running?', e);
    await browser.close();
    process.exit(1);
  }

  // Take initial screenshot
  await page.screenshot({ path: 'initial_load.png' });
  console.log('Took screenshot: initial_load.png');

  // 2. Look for UI elements to see if it rendered
  const html = await page.content();
  if (html.includes('Notrix')) {
    console.log('UI loaded successfully. Notrix found.');
  } else {
    console.log('Failed to find Notrix UI. Printing HTML:');
    console.log(html.substring(0, 500));
  }

  // We are going to find the "Create Note" button or click a note to test editor
  try {
    console.log('Evaluating buttons...');
    await page.evaluate(() => {
      // Find the button that creates a new note (it might just be a div or button)
      const buttons = Array.from(document.querySelectorAll('button, div'));
      const newNoteBtn = buttons.find(b => b.textContent && b.textContent.includes('+ New Note'));
      if (newNoteBtn) {
        newNoteBtn.click();
      }
    });
    
    // Wait for a bit
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: 'after_new_note.png' });
    console.log('Took screenshot: after_new_note.png');
    
    // Switch to Graph View
    console.log('Switching to Graph View...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const graphBtn = buttons.find(b => b.textContent && b.textContent.includes('Graph View'));
      if (graphBtn) {
        graphBtn.click();
      }
    });

    // Wait for Sigma.js to layout
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'graph_view.png' });
    console.log('Took screenshot: graph_view.png');

  } catch (e) {
    console.error('Error during interaction:', e);
  }

  // Grab any console errors from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await browser.close();
  console.log('Test completed.');
})();
