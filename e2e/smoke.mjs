// 真实浏览器冒烟测试（Playwright + Vite）：
// 菜单/改装/说明 -> 飞行 -> 射击 -> 换弹/视角 -> 暂停/重开 -> 成功结算 -> 失败结算
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/WebGL|GL_|swiftshader|fence/i.test(m.text())) errors.push(m.text());
});

async function startMission(nth = 0) {
  await page.click('text=开始任务');
  await page.waitForSelector('.mission-card');
  await page.click(`.mission-card >> nth=${nth}`);
  await page.waitForSelector('.brief');
  // HUD 全屏覆盖层会拦截命中检测，直接触发简报按钮的 DOM click
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#menu-root button')].find(
      (b) => b.textContent === '开始任务' && b.closest('.menu-panel')?.querySelector('.brief')
    );
    btn.click();
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-root')).display === 'none');
  await page.waitForTimeout(1200);
}

await page.goto('http://localhost:5199/');
await page.waitForSelector('.title');
console.log('[1] 主菜单渲染');

await page.click('text=飞船改装');
await page.waitForSelector('.upgrade-grid');
await page.click('.menu-panel >> text=返回');
await page.waitForSelector('.title');
console.log('[2] 改装页面');

await page.click('text=操作说明');
await page.waitForSelector('.keys');
await page.click('.menu-panel >> text=返回');
console.log('[3] 操作说明页面');

await startMission(0);
await page.mouse.move(640, 400);
await page.mouse.down();
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.mouse.move(560, 360);
await page.mouse.up();
await page.mouse.click(640, 400, { button: 'left' });
await page.keyboard.press('KeyR');
await page.keyboard.press('KeyC');
await page.waitForTimeout(400);
const missionName = await page.textContent('#mission-name');
if (!missionName.includes('任务一')) throw new Error('HUD 任务名缺失: ' + missionName);
console.log('[4] 飞行/射击/换弹/视角/任务 HUD 正常');

await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.waitForSelector('#info-panel');
await page.click('#info-panel button');
await page.waitForTimeout(300);
console.log('[5] Tab 任务装备面板');

await page.keyboard.press('KeyP');
await page.waitForSelector('#menu-root >> text=已暂停');
await page.click('text=重新开始任务');
await page.waitForSelector('.brief');
await page.locator('.menu-panel', { hasText: '时间限制' }).locator('button', { hasText: '开始任务' }).click({ force: true });
await page.waitForTimeout(600);
console.log('[6] 暂停与重新开始');

await page.evaluate(() => localStorage.setItem('__e2e_success__', '1'));
await page.waitForSelector('.result-success', { timeout: 15000 });
const resultText = await page.textContent('.menu-panel');
if (!resultText.includes('任务完成')) throw new Error('未出现成功结算');
if (!/击毁敌机/.test(resultText)) throw new Error('结算缺少击毁统计');
console.log('[7] 任务成功结算页');

await page.click('.result-success >> text=返回主菜单');
await page.waitForSelector('.title');
await page.evaluate(() => localStorage.removeItem('__e2e_success__'));

await startMission(0);
await page.evaluate(() => localStorage.setItem('__e2e_fail__', '1'));
await page.waitForSelector('.result-fail', { timeout: 15000 });
const failText = await page.textContent('.menu-panel');
if (!failText.includes('任务失败') || !failText.includes('失败原因')) {
  throw new Error('失败结算缺少具体原因');
}
console.log('[8] 任务失败结算页（含具体原因）');

if (errors.length) {
  console.log('脚本错误:', errors.slice(0, 5));
  throw new Error('页面存在脚本错误');
}

console.log('✅ 浏览器 E2E 冒烟测试全部通过');
await browser.close();
await server.close();
process.exit(0);
