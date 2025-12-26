#!/usr/bin/env node
/**
 * 迁移脚本：从 Pages 读取数据并写入 Worker KV
 * 
 * 使用方法：
 * cd worker
 * node migrate.mjs
 */

const PAGES_URL = 'https://hilltoppers.pages.dev';
const KV_NAMESPACE_ID = '0dc72530532c41f3b79647f91bac9766';

async function migrate() {
  console.log('🚀 开始迁移数据从 Pages 到 Worker KV...\n');

  try {
    // 1. 读取 special_days.json
    console.log('📥 读取 special_days.json...');
    const specialDaysRes = await fetch(`${PAGES_URL}/special_days.json`);
    if (!specialDaysRes.ok) {
      throw new Error(`Failed to fetch special_days.json: ${specialDaysRes.status}`);
    }
    const specialDays = await specialDaysRes.json();
    const dateCount = Object.keys(specialDays).length;
    console.log(`✅ 读取成功，共 ${dateCount} 个日期\n`);

    // 2. 写入 special_days 聚合
    console.log('📤 写入 special_days 聚合到 KV...');
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync } = await import('fs');
    
    const tempFile = '/tmp/special_days_migrate.json';
    writeFileSync(tempFile, JSON.stringify(specialDays));
    
    try {
      execSync(`npx wrangler kv key put special_days --path=${tempFile} --namespace-id=${KV_NAMESPACE_ID} --remote`, {
        stdio: 'inherit'
      });
      console.log('✅ special_days 写入成功\n');
    } catch (error) {
      console.error('❌ 写入失败，请检查 wrangler 命令');
      throw error;
    } finally {
      unlinkSync(tempFile);
    }

    // 3. 读取 special_periods.json
    console.log('📥 读取 special_periods.json...');
    const specialPeriodsRes = await fetch(`${PAGES_URL}/special_periods.json`);
    if (!specialPeriodsRes.ok) {
      throw new Error(`Failed to fetch special_periods.json: ${specialPeriodsRes.status}`);
    }
    const specialPeriods = await specialPeriodsRes.json();
    console.log(`✅ 读取成功，共 ${specialPeriods.length} 个时间段\n`);

    // 4. 写入 special_periods
    console.log('📤 写入 special_periods 到 KV...');
    const tempPeriodsFile = '/tmp/special_periods_migrate.json';
    writeFileSync(tempPeriodsFile, JSON.stringify(specialPeriods));
    
    try {
      execSync(`npx wrangler kv key put special_periods --path=${tempPeriodsFile} --namespace-id=${KV_NAMESPACE_ID} --remote`, {
        stdio: 'inherit'
      });
      console.log('✅ special_periods 写入成功\n');
    } catch (error) {
      console.error('❌ 写入失败，请检查 wrangler 命令');
      throw error;
    } finally {
      unlinkSync(tempPeriodsFile);
    }

    // 5. 写入每个日期到 published: 键
    console.log('📤 写入 published 记录...');
    let publishedCount = 0;
    for (const [dateKey, data] of Object.entries(specialDays)) {
      const tempDateFile = `/tmp/published_${dateKey.replace(/-/g, '_')}.json`;
      writeFileSync(tempDateFile, JSON.stringify(data));
      try {
        execSync(`npx wrangler kv key put "published:${dateKey}" --path=${tempDateFile} --namespace-id=${KV_NAMESPACE_ID} --remote`, {
          stdio: 'ignore'
        });
        publishedCount++;
        if (publishedCount % 10 === 0) {
          process.stdout.write(`   已写入 ${publishedCount}/${dateCount} 个记录...\r`);
        }
      } catch (error) {
        console.warn(`\n⚠️  写入 published:${dateKey} 失败`);
      }
      unlinkSync(tempDateFile);
    }
    console.log(`\n✅ 写入 ${publishedCount} 个 published 记录\n`);

    console.log('🎉 迁移完成！');
    console.log(`   - special_days: ${dateCount} 个日期`);
    console.log(`   - special_periods: ${specialPeriods.length} 个时间段`);
    console.log(`   - published: ${publishedCount} 个记录`);

  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrate();

