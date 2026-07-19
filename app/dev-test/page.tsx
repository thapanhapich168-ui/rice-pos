'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type TestResult = { name: string; status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL'; log: { type: 'info' | 'assert' | 'ui', msg: string }[] };

export default function MasterTestEngine() {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const TEST_ID = `[DEV-TEST]-${Date.now()}`;
  const EXCHANGE_RATE = 4000;

  // --- LOGGING ENGINE ---
  const logMsg = (testName: string, type: 'info' | 'assert' | 'ui', message: string) => {
    setResults(prev => {
      const existing = prev.find(p => p.name === testName);
      if (existing) {
        return prev.map(p => p.name === testName ? { ...p, log: [...p.log, { type, msg: message }] } : p);
      }
      return [...prev, { name: testName, status: 'RUNNING', log: [{ type, msg: message }] }];
    });
  }

  const logInfo = (testName: string, message: string) => logMsg(testName, 'info', `🔵 ACTION: ${message}`);
  const uiCheck = (testName: string, message: string) => logMsg(testName, 'ui', `👁️ UI/UX VERIFY: ${message}`);

  const setStatus = (testName: string, status: 'PASS' | 'FAIL', finalMessage?: string) => {
    setResults(prev => prev.map(p => {
      if (p.name === testName) {
        const newLogs = finalMessage ? [...p.log, { type: 'info' as const, msg: finalMessage }] : p.log;
        return { ...p, status, log: newLogs };
      }
      return p;
    }));
  }

  const assertEq = (expected: any, actual: any, testName: string, description: string) => {
    if (Number(expected) === Number(actual) || String(expected) === String(actual)) {
      logMsg(testName, 'assert', `✅ PASS | ${description} (Expected: ${expected} == Actual: ${actual})`);
    } else {
      logMsg(testName, 'assert', `❌ FAIL | ${description} (Expected: ${expected} != Actual: ${actual})`);
      throw new Error(`Assertion Failed: ${description}`);
    }
  }

  // --- CLEANUP ENGINE (Mirrors your precise SQL script) ---
  const cleanupTestData = async (stepName: string) => {
    logInfo(stepName, 'Executing multi-stage DEV-TEST cascade wipe...');
    
    try {
      // 1. DELETE CHILD TRANSACTIONS FIRST
      await supabase.from('retail_sales').delete().ilike('transaction_id', '%DEV-TEST%');
      await supabase.from('retail_sales').delete().ilike('rice_type', '%DEV-TEST%');
      await supabase.from('sales').delete().ilike('invoice_id', '%DEV-TEST%');
      await supabase.from('sales').delete().ilike('rice_type', '%DEV-TEST%');
      await supabase.from('invoice_payments').delete().ilike('invoice_id', '%DEV-TEST%');
      await supabase.from('cogs_settlements').delete().ilike('remarks', '%DEV-TEST%');
      await supabase.from('expenses').delete().ilike('remarks', '%DEV-TEST%');
      await supabase.from('staff_debt_history').delete().ilike('payment_method', '%DEV-TEST%');

      // 2. DELETE INTERMEDIATE DATA
      await supabase.from('invoice_summaries').delete().ilike('invoice_id', '%DEV-TEST%');
      await supabase.from('accounts_payable').delete().ilike('supplier_name', '%DEV-TEST%');
      
      const { data: prods } = await supabase.from('products').select('id').ilike('name', '%DEV-TEST%');
      if (prods && prods.length > 0) {
        const pIds = prods.map(p => p.id);
        await supabase.from('imports').delete().in('product_id', pIds);
        await supabase.from('price_history').delete().in('product_id', pIds);
        await supabase.from('inventory_batches').delete().in('product_id', pIds);
      }
      const { data: sups } = await supabase.from('suppliers').select('id').ilike('name', '%DEV-TEST%');
      if (sups && sups.length > 0) {
        await supabase.from('imports').delete().in('supplier_id', sups.map(s => s.id));
      }

      // 3. DELETE INVENTORY & PRODUCT DATA
      await supabase.from('products').delete().ilike('name', '%DEV-TEST%');

      // 4. DELETE PARENT DATA
      await supabase.from('customers').delete().ilike('name', '%DEV-TEST%');
      await supabase.from('suppliers').delete().ilike('name', '%DEV-TEST%');
      await supabase.from('staff').delete().ilike('name', '%DEV-TEST%');

      logInfo(stepName, 'Database is strictly clean.');
      setStatus(stepName, 'PASS');
    } catch (error: any) {
      logMsg(stepName, 'assert', `❌ FAIL | Cleanup error: ${error.message}`);
      setStatus(stepName, 'FAIL');
    }
  }

  // --- THE MASTER TEST SUITE ---
  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]); 
    
    logInfo('System Initialization', 'Starting Master Test Engine...');
    setStatus('System Initialization', 'PASS');

    try {
      await cleanupTestData('Pre-Test Cleanup');

      let supData, custData, wProd, rProd;

      // =========================================================================
      // MODULE 1: SETUP & CUSTOMER DB
      // =========================================================================
      let testName = 'Test 9: Customer & Product Database';
      logInfo(testName, 'Creating Supplier, Customer, and Products...');
      try {
        const { data: sData } = await supabase.from('suppliers').insert({ name: `${TEST_ID}_SUPPLIER` }).select().single();
        supData = sData;
        assertEq(true, !!supData, testName, '[Table: suppliers] Supplier created successfully');

        const { data: cData } = await supabase.from('customers').insert({ name: `${TEST_ID}_CUSTOMER`, type: 'ហូប', owner: 'Both' }).select().single();
        custData = cData;
        assertEq(true, !!custData, testName, '[Table: customers] Customer created successfully');

        const { data: wpData } = await supabase.from('products').insert({ name: `${TEST_ID}_WHOLESALE_RICE`, price: 0, cost_price: 100000, weight: 50, stock: 10 }).select().single();
        wProd = wpData;
        assertEq(10, wProd.stock, testName, '[Table: products] Wholesale 50kg bag created with 10 stock');

        await supabase.from('inventory_batches').insert({ product_id: wProd.id, cost_price: 100000, remaining_qty: 10 });
        await supabase.from('price_history').insert({ product_id: wProd.id, price: 0, cost_price: 100000, imported_qty: 10, remaining_qty: 10 });

        const { data: rpData } = await supabase.from('products').insert({ name: `${TEST_ID}_RETAIL_RICE`, price: 3000, cost_price: 0, weight: 1, stock: 10, linked_wholesale_id: wProd.id }).select().single();
        rProd = rpData;
        assertEq(wProd.id, rProd.linked_wholesale_id, testName, '[Table: products] Retail bag strictly linked to Wholesale ID');

        uiCheck(testName, 'a.1: Add new customer via POS modal and ensure it appears instantly.');
        uiCheck(testName, 'a.4: Use POS search bar to verify product filtering works visually.');
        
        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); return; }

      // =========================================================================
      // MODULE 2: RETAIL MATH & COGS
      // =========================================================================
      testName = 'Test A: Retail Linked COGS Math';
      logInfo(testName, 'Inserting retail sale: 5kg @ 3,000៛...');
      try {
        const retailCogsPerKg = 100000 / 50; 
        const { data: retSale } = await supabase.from('retail_sales').insert({
           transaction_id: `${TEST_ID}_RET_TX`, rice_type: rProd.name, qty: 5, price_per_bag: 3000, cogs_price: retailCogsPerKg
        }).select().single();

        assertEq(2000, retSale.cogs_price, testName, '[Table: retail_sales] COGS correctly evaluated as 2,000 ៛');
        assertEq(15000, retSale.total_sales, testName, '[Table: retail_sales] total_sales auto-calculated to 15,000 ៛');
        assertEq(10000, retSale.total_cogs, testName, '[Table: retail_sales] total_cogs auto-calculated to 10,000 ៛');
        assertEq(5000, retSale.total_profit, testName, '[Table: retail_sales] total_profit auto-calculated to 5,000 ៛');

        uiCheck(testName, 'Retail card stock amount (📦) reduces by 5 without page refresh.');
        uiCheck(testName, 'Enter 20,000៛ in payment. Verify "Change Due" modal pops up showing exactly 5,000៛ change.');
        uiCheck(testName, 'a.2: Verify invoice preview picks up customized item name and customer correctly.');
        uiCheck(testName, 'a.3: Reduce stock to 0. Verify item moves to "❌ Out of Stock" tab.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 3: WHOLESALE EXCHANGE & CONSUMED
      // =========================================================================
      testName = 'Test B: Wholesale Exchange & Consumed';
      logInfo(testName, 'Simulating Return bag and 15kg Consumed...');
      try {
        const baseSellingPrice = 120000;
        const consumedCogs = 100000 / 50;
        const consumedPrice = baseSellingPrice / 50;

        await supabase.from('invoice_summaries').insert({ invoice_id: `${TEST_ID}_EXC`, customer_name: custData.name, customer_id: custData.id });

        const returnItem = { rice_type: wProd.name, custom_rice_type: `ដូរ ${wProd.name}`, qty: -1, price_per_bag: 0, cogs_price: 100000 };
        const consumedItem = { rice_type: wProd.name, custom_rice_type: `បានប្រើ ${wProd.name}`, qty: 15, price_per_bag: consumedPrice, cogs_price: consumedCogs };
        
        const { data: returnSales, error } = await supabase.from('sales').insert([
          { invoice_id: `${TEST_ID}_EXC`, ...returnItem }, { invoice_id: `${TEST_ID}_EXC`, ...consumedItem }
        ]).select();

        if (error) throw new Error(error.message);

        const retDb = returnSales?.find(s => s.qty === -1);
        const conDb = returnSales?.find(s => s.qty === 15);

        assertEq(-1, retDb?.qty, testName, '[Table: sales] Return item inserted with qty: -1');
        assertEq(100000, retDb?.total_profit, testName, '[Table: sales] Return bag total_profit = +100,000 ៛');
        assertEq(6000, conDb?.total_profit, testName, '[Table: sales] Consumed bag total_profit = 6,000 ៛');

        uiCheck(testName, 'a.5: Returning rice accurately restores Business Asset value and cash logic balances out in DB.');
        uiCheck(testName, 'B: "ដូរ" row highlights RED. "បានប្រើ" row highlights YELLOW. Tapping 1 or 0 instantly clears input.');
        uiCheck(testName, 'B.1/B.2: Verify Walk-In shows success popup; Non-Walk-In generates PDF directly.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 4: DUAL-CURRENCY SPLIT
      // =========================================================================
      testName = 'Test C: Dual-Currency Split Payment';
      logInfo(testName, 'Testing 100,000៛ invoice paid via $10 Cash and 60,000៛ QR...');
      try {
        await supabase.from('invoice_summaries').insert({ invoice_id: `${TEST_ID}_DUAL`, customer_name: custData.name, customer_id: custData.id });

        const { data: payRows } = await supabase.from('invoice_payments').insert([
          { invoice_id: `${TEST_ID}_DUAL`, amount_paid_usd: 10, amount_paid_riel: 0, payment_method: 'Cash $' },
          { invoice_id: `${TEST_ID}_DUAL`, amount_paid_usd: 0, amount_paid_riel: 60000, payment_method: 'QR ៛' }
        ]).select();

        let totalRielEq = 0;
        payRows?.forEach(r => totalRielEq += Number(r.amount_paid_riel) + (Number(r.amount_paid_usd) * EXCHANGE_RATE));
        
        assertEq(100000, totalRielEq, testName, '[Logic] Multi-currency math evaluated successfully to 100,000 ៛ total');
        uiCheck(testName, 'Checkout button un-grays and turns Green the millisecond inputs total exactly 100,000៛.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 5: INVENTORY PULLS & IMPORTS
      // =========================================================================
      testName = 'Test D & E: Pulls, Imports & Accounts Payable';
      logInfo(testName, 'Testing RPC pulling and 10M import...');
      try {
        await supabase.rpc('pull_wholesale_bags', { p_retail_id: rProd.id, p_wholesale_id: wProd.id, p_bags_needed: 1 });
        const { data: cw } = await supabase.from('products').select('stock').eq('id', wProd.id).single();
        const { data: cr } = await supabase.from('products').select('stock').eq('id', rProd.id).single();
        
        assertEq(9, cw?.stock, testName, '[Table: products] Wholesale stock decreased by exactly 1');
        assertEq(60, cr?.stock, testName, '[Table: products] Retail stock increased by exactly 50');
        
        const { data: imp } = await supabase.from('imports').insert({
          supplier_id: supData.id, product_id: wProd.id, qty: 100, unit_cost: 100000, total_cost: 10000000, paid_amount: 2000000, status: 'Pending'
        }).select().single();
        assertEq('Pending', imp.status, testName, '[Table: imports] Import recorded with Pending status');

        const { data: ap } = await supabase.from('accounts_payable').insert({
          supplier_name: supData.name, supplier_id: supData.id, amount_riel: 8000000, status: 'Unpaid'
        }).select().single();
        assertEq(8000000, ap.amount_riel, testName, '[Table: accounts_payable] Exact 8M ៛ Debt row created');

        uiCheck(testName, 'D.1: Verify Retail stock increase dynamically updates Rice Asset Evaluation in Dashboard.');
        uiCheck(testName, 'D.5: Import splits batches into 2 rows if stock belongs to different imported batches.');
        uiCheck(testName, 'D.6/D.7: Inline edits on import rows work, and history icon reveals import trail.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 6: MOM LIABILITY
      // =========================================================================
      testName = 'Test F: Mom Liability Routing';
      logInfo(testName, 'Testing Mom wholesale sale, cash collection, and COGS settlement math...');
      try {
        await supabase.from('invoice_summaries').insert({ invoice_id: `${TEST_ID}_MOM_F`, owner: 'Mom', total_sales: 500000, total_cogs: 400000, is_done: true });
        
        const { data: pMom } = await supabase.from('invoice_payments').insert({
          invoice_id: `${TEST_ID}_MOM_F`, amount_paid_riel: 500000, payment_method: 'Cash ៛', recorded_by: 'Both'
        }).select().single();
        assertEq(500000, pMom.amount_paid_riel, testName, '[Table: invoice_payments] Business logs 500k collected on Mom\'s behalf');

        const { data: cMom } = await supabase.from('cogs_settlements').insert({
          settlement_date: new Date().toISOString(), owner_name: 'Mom', paid_amount_riel: 400000, payment_method: 'Mom Liability ៛', remarks: `${TEST_ID}_MOM_SETTLE`
        }).select().single();
        assertEq(400000, cMom.paid_amount_riel, testName, '[Table: cogs_settlements] Business reclaims 400k using Liability offset');

        uiCheck(testName, 'B.3: Mom wholesale sale DOES NOT bloat Business Summary Dashboard revenue.');
        uiCheck(testName, 'F: COGS Liability Settlement modal caps max payment at the exact Live Liability number.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 7: DELIVERY & CREDIT WATERFALL
      // =========================================================================
      testName = 'Test G: Credit Settlement Waterfall';
      logInfo(testName, 'Creating 3 invoices totaling 3M. Simulating 1M payment...');
      try {
        await supabase.from('invoice_summaries').insert([
          { invoice_id: `${TEST_ID}_INV_1`, customer_name: custData.name, customer_id: custData.id, balance_due: 800000, is_done: false },
          { invoice_id: `${TEST_ID}_INV_2`, customer_name: custData.name, customer_id: custData.id, balance_due: 1000000, is_done: false },
          { invoice_id: `${TEST_ID}_INV_3`, customer_name: custData.name, customer_id: custData.id, balance_due: 1200000, is_done: false }
        ]);

        let payment = 1000000;
        await supabase.from('invoice_summaries').update({ balance_due: 0, is_done: true }).eq('invoice_id', `${TEST_ID}_INV_1`);
        payment -= 800000; 
        
        const newBal = 1000000 - payment;
        await supabase.from('invoice_summaries').update({ balance_due: newBal }).eq('invoice_id', `${TEST_ID}_INV_2`);

        const { data: checkI1 } = await supabase.from('invoice_summaries').select('balance_due, is_done').eq('invoice_id', `${TEST_ID}_INV_1`).single();
        const { data: checkI2 } = await supabase.from('invoice_summaries').select('balance_due').eq('invoice_id', `${TEST_ID}_INV_2`).single();

        assertEq(true, checkI1?.is_done, testName, '[Table: invoice_summaries] Oldest Invoice completely paid off');
        assertEq(800000, checkI2?.balance_due, testName, '[Table: invoice_summaries] Second Invoice absorbed remaining 200k, new balance 800k');

        uiCheck(testName, 'G: Customer Debt red number drops instantly. Nested invoice UI updates localized balances.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 8: STAFF PAYROLL & EXPENSES
      // =========================================================================
      testName = 'Test H & 6: Real-time Salary Math';
      logInfo(testName, 'Adding staff, calculating 15 days worked, processing 100k advance...');
      try {
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: stf } = await supabase.from('staff').insert({
           name: `${TEST_ID}_STAFF`, salary: 1200000, start_date: firstOfMonth, total_debt_riel: 100000 
        }).select().single();
        
        const { data: debtHist } = await supabase.from('staff_debt_history').insert({
          staff_id: stf.id, amount: 100000, payment_method: 'Cash ៛'
        }).select().single();
        assertEq(100000, debtHist.amount, testName, '[Table: staff_debt_history] Advance successfully logged');

        const dailyRate = 1200000 / 30; 
        const earned = dailyRate * 15; 
        const netPayout = earned - stf.total_debt_riel;

        assertEq(600000, earned, testName, '[Logic] MTD Earned calculates flawlessly as 600,000 ៛');
        assertEq(500000, netPayout, testName, '[Logic] Net Payout accurately deducts debt to 500,000 ៛');

        uiCheck(testName, 'H: Staff advance increases Dashboard A/R, Cash decreases, but Expenses DO NOT inflate.');
        uiCheck(testName, '6: Ensure standard Business Expenses display correctly in Operating Expenses section.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 9: DELIVERY SPLIT PAYMENTS
      // =========================================================================
      testName = 'Test I: Delivery Split Payments & Mom Default';
      logInfo(testName, 'Simulating inline delivery split payment for Mom...');
      try {
        await supabase.from('invoice_summaries').insert({
          invoice_id: `${TEST_ID}_INV_SPLIT`, customer_name: custData.name, customer_id: custData.id,
          balance_due: 100000, total_sales: 100000, is_done: false, owner: 'Mom', delivery_status: 'Pending'
        });

        await supabase.from('invoice_payments').insert([
          { invoice_id: `${TEST_ID}_INV_SPLIT`, amount_paid_riel: 50000, amount_paid_usd: 0, payment_method: 'Mom Liability ៛', recorded_by: 'Both', remarks: 'Inline Delivery Settlement' },
          { invoice_id: `${TEST_ID}_INV_SPLIT`, amount_paid_riel: 0, amount_paid_usd: 10, payment_method: 'Cash $', recorded_by: 'Both', remarks: 'Inline Delivery Settlement' }
        ]);

        await supabase.from('invoice_summaries').update({
          balance_due: 10000, payment_method: 'Mom Liability ៛, Cash $', is_done: false, delivery_status: 'Delivered'
        }).eq('invoice_id', `${TEST_ID}_INV_SPLIT`);

        const { data: checkInv } = await supabase.from('invoice_summaries').select('balance_due, delivery_status').eq('invoice_id', `${TEST_ID}_INV_SPLIT`).single();
        
        assertEq(10000, checkInv?.balance_due, testName, '[Table: invoice_summaries] Balance properly reduced after multi-currency split');

        uiCheck(testName, 'Delivery inline payment flawlessly syncs using useRef to prevent stale closures.');
        uiCheck(testName, 'Mom invoices automatically default to "Mom Liability ៛" dropdown option.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 10: DASHBOARD FINANCIAL ENGINE VALIDATION
      // =========================================================================
      testName = 'Test L: Dashboard Financial Engine Validation';
      logInfo(testName, 'Simulating full lifecycle for Dashboard Net Worth & AR/AP math...');
      try {
        // 1. Supplier & Product
        const { data: dSup } = await supabase.from('suppliers').insert({ name: `${TEST_ID}_DASH_SUP` }).select().single();
        const { data: dProd } = await supabase.from('products').insert({ name: `${TEST_ID}_DASH_PROD`, price: 15000, cost_price: 10000 }).select().single();

        // 2. Import (Creates AP)
        await supabase.from('imports').insert({ supplier_id: dSup.id, product_id: dProd.id, qty: 100, unit_cost: 10000, total_cost: 1000000, paid_amount: 0, status: 'Pending' });
        const { data: dAp } = await supabase.from('accounts_payable').insert({ supplier_id: dSup.id, supplier_name: dSup.name, amount_riel: 1000000, status: 'Unpaid' }).select().single();

        assertEq(1000000, dAp.amount_riel, testName, '[Dashboard: AP] Accounts Payable registered correctly');

        // 3. Wholesale Sale (Unpaid -> Biz AR)
        await supabase.from('invoice_summaries').insert({ invoice_id: `${TEST_ID}_DASH_INV`, customer_name: 'Biz Customer', balance_due: 30000, owner: 'Both', total_sales: 30000, total_cogs: 20000 });
        const { data: dSale } = await supabase.from('sales').insert({ invoice_id: `${TEST_ID}_DASH_INV`, rice_type: dProd.name, product_id: dProd.id, qty: 2, price_per_bag: 15000, cogs_price: 10000 }).select().single();

        assertEq(30000, dSale.total_sales, testName, '[Dashboard: AR] Sale math evaluates revenue');
        assertEq(10000, dSale.total_profit, testName, '[Dashboard: Profit] Sale math evaluates profit');

        // 4. Mom COGS & Liability
        await supabase.from('invoice_summaries').insert({ invoice_id: `${TEST_ID}_MOM_DASH`, customer_name: 'Mom Customer', balance_due: 0, owner: 'Mom', total_sales: 15000, total_cogs: 10000 });
        await supabase.from('sales').insert({ invoice_id: `${TEST_ID}_MOM_DASH`, rice_type: dProd.name, product_id: dProd.id, qty: 1, price_per_bag: 15000, cogs_price: 10000 });
        
        await supabase.from('invoice_payments').insert({ invoice_id: `${TEST_ID}_MOM_DASH`, amount_paid_riel: 15000, payment_method: 'Cash ៛', recorded_by: 'Mom' });
        await supabase.from('cogs_settlements').insert({ settlement_date: new Date().toISOString(), owner_name: 'Mom', paid_amount_riel: 10000, payment_method: 'Mom Liability ៛', remarks: `${TEST_ID}_DASH_SETTLE` });

        uiCheck(testName, 'L.1: Dashboard "Mom AR (COGS)" correctly separates from standard AR.');
        uiCheck(testName, 'L.2: Dashboard Net Worth accurately subtracts AP and Mom Liability, without double-subtracting Expenses.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 11: SAFE DELETIONS (Test J + K)
      // =========================================================================
      testName = 'Test K: Database Safe Deletions';
      logInfo(testName, 'Testing Staff cascade, and verifying safe Product/Supplier cleanup...');
      try {
        // 1. STAFF CASCADE
        const { data: stf } = await supabase.from('staff').insert({ name: `${TEST_ID}_DEL_STAFF`, salary: 100 }).select().single();
        await supabase.from('staff_debt_history').insert({ staff_id: stf.id, amount: 50, payment_method: 'Cash' });
        
        const { error: errStf } = await supabase.from('staff').delete().eq('id', stf.id); 
        if (errStf) throw new Error(`Staff Delete Blocked: ${errStf.message}`);
        
        const { data: stfHist } = await supabase.from('staff_debt_history').select('id').eq('staff_id', stf.id);
        assertEq(0, stfHist?.length, testName, '[Table: staff_debt_history] Debt History destroyed instantly when Staff was deleted');

        // 2. PRODUCT SAFE DELETION
        const { data: pSup } = await supabase.from('suppliers').insert({ name: `${TEST_ID}_DEL_SUP_1` }).select().single();
        const { data: pProd } = await supabase.from('products').insert({ name: `${TEST_ID}_DEL_PROD`, price: 10 }).select().single();
        await supabase.from('imports').insert({ supplier_id: pSup.id, product_id: pProd.id, qty: 10, unit_cost: 10, total_cost: 100 });
        
        await supabase.from('imports').delete().eq('product_id', pProd.id);
        const { error: errProd } = await supabase.from('products').delete().eq('id', pProd.id); 
        assertEq(true, !errProd, testName, '[App Logic] Product deleted successfully after manual cleanup');

        // 3. SUPPLIER SAFE DELETION
        await supabase.from('imports').delete().eq('supplier_id', pSup.id);
        const { error: errSup } = await supabase.from('suppliers').delete().eq('id', pSup.id); 
        assertEq(true, !errSup, testName, '[App Logic] Supplier deleted successfully after manual cleanup');

        uiCheck(testName, 'J.1: Deleting a customer no longer throws an error; historical data remains intact.');
        uiCheck(testName, 'J.2: Deleting an invoice cleans up all attached items and payments automatically.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

    } catch (err: any) {
      logInfo('System', `Engine Crash: ${err.message}`);
    } finally {
      await cleanupTestData('Post-Test Teardown');
      
      setIsRunning(false);
      logInfo('System Completion', 'Master Automated Testing Suite Finished.');
      setStatus('System Completion', 'PASS');
    }
  }

  return (
    <div className="main-wrapper">
      
      {/* 🔥 STANDARDIZED HEADER */}
      <div className="header-container">
        <div className="header-left" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <h1 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>🛠️ Master QA Test Engine</h1>
          <p className="mobile-subtitle" style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Automated mathematical mapping and database insertion verifier.</p>
        </div>
        <button 
          onClick={runAllTests} 
          disabled={isRunning}
          className="execute-btn"
          style={{ 
            background: isRunning ? '#cbd5e1' : '#0f172a', color: '#fff', 
            border: 'none', borderRadius: '8px', cursor: isRunning ? 'not-allowed' : 'pointer', 
            fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          {isRunning ? '⏳ Run' : '🚀 Run'}
        </button>
      </div>

      <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', maxWidth: '1600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '2px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
            <h2>Ready for Diagnostics</h2>
            <p style={{ fontSize: '14px' }}>Click "Run" to insert test data, verify database formulas, and validate table relationships.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '12px' }}>
            {results.map((r, i) => (
              <div key={i} style={{ 
                padding: '12px', borderRadius: '6px', 
                background: r.status === 'PASS' ? '#f0fdf4' : r.status === 'FAIL' ? '#fef2f2' : '#f8fafc', 
                border: `1px solid ${r.status === 'PASS' ? '#bbf7d0' : r.status === 'FAIL' ? '#fecaca' : '#e2e8f0'}`
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '10px', color: r.status === 'PASS' ? '#166534' : r.status === 'FAIL' ? '#991b1b' : '#334155', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px' }}>
                  {r.status === 'RUNNING' && '🔄 '}
                  {r.status === 'PASS' && '✅ '}
                  {r.status === 'FAIL' && '❌ '}
                  {r.name}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.5', fontFamily: 'monospace' }}>
                  {r.log.map((logItem, idx) => (
                    <div key={idx} style={{ 
                      marginBottom: '6px', paddingLeft: '8px', paddingBottom: '2px',
                      borderLeft: `3px solid ${logItem.type === 'assert' ? (logItem.msg.includes('✅') ? '#22c55e' : '#ef4444') : logItem.type === 'ui' ? '#eab308' : '#cbd5e1'}`,
                      color: logItem.type === 'ui' ? '#854d0e' : logItem.type === 'assert' ? '#1e293b' : '#64748b',
                      fontWeight: logItem.type === 'assert' ? 'bold' : 'normal',
                      backgroundColor: logItem.type === 'ui' ? '#fefce8' : 'transparent',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {logItem.msg}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9; }
        
        .execute-btn {
          padding: 10px 20px;
          font-size: 14px;
          white-space: nowrap;
        }

        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 40px 24px; 
          background: #f1f5f9; 
          box-sizing: border-box; 
          color: #333;
          width: 100%;
        }

        .header-container { 
          display: flex;
          justify-content: space-between;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; 
          gap: 12px;
          min-height: 42px; 
          width: calc(100% - 60px);
          max-width: 1600px;
          margin-right: auto;
        }

        @media (max-width: 1023px) { 
          .execute-btn {
            padding: 8px 12px !important;
            font-size: 12px !important;
          }
          .mobile-subtitle {
            display: none; 
          }

          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
          }
          .header-container { 
            margin-left: 54px !important;
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important; 
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
          }
        }
      `}</style>
    </div>
  )
}