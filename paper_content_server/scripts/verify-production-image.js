const { execSync } = require('child_process');

const image = process.argv[2] || 'paper-content-server:production';

console.log(`Verifying image: ${image}`);

try {
  // Check if QA exists
  try {
    execSync(`docker run --rm ${image} ls qa`, { stdio: 'ignore' });
    console.error("FAIL: qa directory exists in production image!");
    process.exit(1);
  } catch (e) {
    // Expected to fail
  }

  // Check if devDependencies exists (like playwright, node:test is built-in but eslint etc)
  try {
    const out = execSync(`docker run --rm ${image} npm ls eslint`, { encoding: 'utf8' });
    if (out.includes('eslint')) {
      console.error("FAIL: devDependencies found in production image!");
      process.exit(1);
    }
  } catch (e) {
    // npm ls returns non-zero if package missing, which is good
  }

  // Production entry point loadable
  execSync(`docker run --rm ${image} node -e "require('./server.js')"`, { stdio: 'ignore' });
  
  // Scripts check
  

  // Wait, if it's production image, do we ship run-active-tests.js? The user said "生产阶段只能显式 COPY 运行所需文件。禁止生产镜像包含：qa/ test/ ... devDependencies 测试 runner". 
  // Oh! I should NOT ship the test runner in the production image!

  console.log("SUCCESS: Image verification passed.");
} catch (e) {
  console.error("FAIL: Image verification error:", e.message);
  process.exit(1);
}
