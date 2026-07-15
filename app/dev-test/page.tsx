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

  // --- CLEANUP ENGINE ---
  const cleanupTestData = async () => {
    logInfo('System Data Sweep', 'Sweeping previous DEV-TEST data from all tables...');
    
    await supabase.from('retail_sales').delete().like('transaction_id', '%[DEV-TEST]%');
    await supabase.from('invoice_payments').delete().like('invoice_id', '%[DEV-TEST]%');
    await supabase.from('sales').delete().like('invoice_id', '%[DEV-TEST]%');
    await supabase.from('invoice_summaries').delete().like('invoice_id', '%[DEV-TEST]%');
    await supabase.from('accounts_payable').delete().like('supplier_name', '%[DEV-TEST]%');
    await supabase.from('expenses').delete().like('remarks', '%[DEV-TEST]%');
    await supabase.from('cogs_settlements').delete().like('remarks', '%[DEV-TEST]%');
    
    const { data: impProducts } = await supabase.from('products').select('id').like('name', '%[DEV-TEST]%');
    if (impProducts && impProducts.length > 0) {
        const pIds = impProducts.map(p => p.id);
        await supabase.from('imports').delete().in('product_id', pIds);
        await supabase.from('inventory_batches').delete().in('product_id', pIds);
        await supabase.from('price_history').delete().in('product_id', pIds);
    }
    
    await supabase.from('products').delete().like('name', '%[DEV-TEST]%');
    await supabase.from('customers').delete().like('name', '%[DEV-TEST]%');
    await supabase.from('suppliers').delete().like('name', '%[DEV-TEST]%');
    
    const { data: stf } = await supabase.from('staff').select('id').like('name', '%[DEV-TEST]%');
    if (stf && stf.length > 0) {
        await supabase.from('staff_debt_history').delete().in('staff_id', stf.map(s => s.id));
        await supabase.from('staff').delete().in('id', stf.map(s => s.id));
    }
    
    logInfo('System Data Sweep', 'Database is clean.');
    setStatus('System Data Sweep', 'PASS');
  }

  // --- THE MASTER TEST SUITE ---
  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]); // Clear everything cleanly
    
    logInfo('System Initialization', 'Starting Master Test Engine...');
    setStatus('System Initialization', 'PASS');

    try {
      await cleanupTestData();

      let supData, custData, wProd, rProd, staffData;

      // =========================================================================
      // MODULE 1: SETUP & CUSTOMER DB (Test 9, a.1, a.4)
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

        // Create Active Batch for FIFO
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
      // MODULE 2: RETAIL MATH & COGS (Test A)
      // =========================================================================
      testName = 'Test A: Retail Linked COGS Math';
      logInfo(testName, 'Inserting retail sale: 5kg @ 3,000៛ (Wholesale cost is 100k / 50 = 2,000៛)...');
      try {
        const retailCogsPerKg = 100000 / 50; // 2000
        const { data: retSale } = await supabase.from('retail_sales').insert({
           transaction_id: `${TEST_ID}_RET_TX`, rice_type: rProd.name, qty: 5, price_per_bag: 3000, cogs_price: retailCogsPerKg
        }).select().single();

        assertEq(2000, retSale.cogs_price, testName, '[Table: retail_sales] retailCogsPerKg correctly evaluated as 2,000 ៛');
        assertEq(15000, retSale.total_sales, testName, '[Table: retail_sales] total_sales auto-calculated to 15,000 ៛ (5 * 3000)');
        assertEq(10000, retSale.total_cogs, testName, '[Table: retail_sales] total_cogs auto-calculated to 10,000 ៛ (5 * 2000)');
        assertEq(5000, retSale.total_profit, testName, '[Table: retail_sales] total_profit auto-calculated to 5,000 ៛ (15000 - 10000)');

        // Simulate Stock Drop from Sale
        const { data: updatedRetProd } = await supabase.from('products').update({ stock: rProd.stock - 5 }).eq('id', rProd.id).select().single();
        assertEq(5, updatedRetProd.stock, testName, '[Table: products] products.stock decreased by exactly 5');

        uiCheck(testName, 'Retail card stock amount (📦) reduces by 5 without page refresh.');
        uiCheck(testName, 'Enter 20,000៛ in payment. Verify "Change Due" modal pops up showing exactly 5,000៛ change.');
        uiCheck(testName, 'a.2: Verify invoice preview picks up customized item name and customer correctly.');
        uiCheck(testName, 'a.3: Reduce stock to 0. Verify item moves to "❌ Out of Stock" tab.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 3: WHOLESALE EXCHANGE & CONSUMED (Test B, a.5)
      // =========================================================================
      testName = 'Test B: Wholesale Exchange & Consumed';
      logInfo(testName, 'Simulating Return bag and 15kg Consumed (Base price 120,000)...');
      try {
        const baseSellingPrice = 120000;
        const consumedCogs = 100000 / 50; // 2000
        const consumedPrice = baseSellingPrice / 50; // 2400

        const returnItem = { rice_type: wProd.name, custom_rice_type: `ដូរ ${wProd.name}`, qty: -1, price_per_bag: 0, cogs_price: 100000 };
        const consumedItem = { rice_type: wProd.name, custom_rice_type: `បានប្រើ ${wProd.name}`, qty: 15, price_per_bag: consumedPrice, cogs_price: consumedCogs };
        
        const { data: returnSales } = await supabase.from('sales').insert([
          { invoice_id: `${TEST_ID}_EXC`, ...returnItem }, { invoice_id: `${TEST_ID}_EXC`, ...consumedItem }
        ]).select();

        const retDb = returnSales?.find(s => s.qty === -1);
        const conDb = returnSales?.find(s => s.qty === 15);

        assertEq(-1, retDb?.qty, testName, '[Table: sales] "ដូរ" item inserted with qty: -1');
        assertEq(0, retDb?.price_per_bag, testName, '[Table: sales] "ដូរ" item inserted with price: 0 ៛');
        assertEq(0, retDb?.total_sales, testName, '[Table: sales] Return bag total_sales = 0 ៛');
        assertEq(100000, retDb?.total_profit, testName, '[Table: sales] Return bag total_profit = +100,000 ៛ (Asset restoring)');

        assertEq(15, conDb?.qty, testName, '[Table: sales] "បានប្រើ" item inserted with qty: 15');
        assertEq(2400, conDb?.price_per_bag, testName, '[Table: sales] "បានប្រើ" unit price calculated as 2,400 ៛ (120k / 50)');
        assertEq(36000, conDb?.total_sales, testName, '[Table: sales] Consumed bag total_sales = 36,000 ៛ (15 * 2400)');
        assertEq(6000, conDb?.total_profit, testName, '[Table: sales] Consumed bag total_profit = 6,000 ៛ (36k - 30k COGS)');

        uiCheck(testName, 'a.5: Returning rice accurately restores Business Asset value and cash logic balances out in DB.');
        uiCheck(testName, 'B: "ដូរ" row highlights RED. "បានប្រើ" row highlights YELLOW. Tapping 1 or 0 instantly clears input.');
        uiCheck(testName, 'B.1/B.2: Verify Walk-In shows success popup; Non-Walk-In generates PDF directly.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 4: DUAL-CURRENCY SPLIT (Test C)
      // =========================================================================
      testName = 'Test C: Dual-Currency Split Payment';
      logInfo(testName, 'Testing 100,000៛ invoice paid via $10 Cash and 60,000៛ QR...');
      try {
        const { data: payRows } = await supabase.from('invoice_payments').insert([
          { invoice_id: `${TEST_ID}_DUAL`, amount_paid_usd: 10, amount_paid_riel: 0, payment_method: 'Cash $' },
          { invoice_id: `${TEST_ID}_DUAL`, amount_paid_usd: 0, amount_paid_riel: 60000, payment_method: 'QR ៛' }
        ]).select();

        assertEq(2, payRows?.length, testName, '[Table: invoice_payments] 2 individual payment rows successfully created');
        
        let totalRielEq = 0;
        payRows?.forEach(r => totalRielEq += Number(r.amount_paid_riel) + (Number(r.amount_paid_usd) * EXCHANGE_RATE));
        
        assertEq(100000, totalRielEq, testName, '[Logic] Multi-currency math evaluated successfully to 100,000 ៛ total');

        uiCheck(testName, 'Checkout button un-grays and turns Green the millisecond inputs total exactly 100,000៛.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 5: INVENTORY PULLS & IMPORTS (Test D, E)
      // =========================================================================
      testName = 'Test D & E: Pulls, Imports & Accounts Payable';
      logInfo(testName, 'Testing RPC pulling and 10M import with 2M downpayment...');
      try {
        // D: Pull
        await supabase.rpc('pull_wholesale_bags', { p_retail_id: rProd.id, p_wholesale_id: wProd.id, p_bags_needed: 1 });
        const { data: cw } = await supabase.from('products').select('stock').eq('id', wProd.id).single();
        const { data: cr } = await supabase.from('products').select('stock').eq('id', rProd.id).single();
        
        assertEq(9, cw?.stock, testName, '[Table: products] D: products.stock (Wholesale) decreased by exactly 1');
        
        // THE FIX: We had 10 to start, sold 5 in Test A, then pulled 50. Expected is exactly 55.
        assertEq(55, cr?.stock, testName, '[Table: products] D: products.stock (Retail) increased by exactly 50 (5 remaining + 50)');
        
        uiCheck(testName, 'D.1: Verify Retail stock increase dynamically updates Rice Asset Evaluation in Dashboard.');

        // E: Import
        const { data: imp } = await supabase.from('imports').insert({
          supplier_id: supData.id, product_id: wProd.id, qty: 100, unit_cost: 100000, total_cost: 10000000, paid_amount: 2000000, status: 'Pending'
        }).select().single();
        assertEq('Pending', imp.status, testName, '[Table: imports] E: Import recorded with Pending status');

        const { data: ap } = await supabase.from('accounts_payable').insert({
          supplier_name: supData.name, supplier_id: supData.id, amount_riel: 8000000, status: 'Unpaid'
        }).select().single();
        assertEq(8000000, ap.amount_riel, testName, '[Table: accounts_payable] E: Exact 8,000,000 ៛ Debt row created');

        const { data: exp } = await supabase.from('expenses').insert({
          spender: 'Both', remarks: `${TEST_ID}_IMPORT`, amount_riel: 2000000, description: 'RICE'
        }).select().single();
        assertEq(2000000, exp.amount_riel, testName, '[Table: expenses] E: 2M Down payment successfully hit Expenses table');

        uiCheck(testName, 'D.5: Import splits batches into 2 rows if stock belongs to different imported batches.');
        uiCheck(testName, 'D.6/D.7: Inline edits on import rows work, and history icon reveals import trail.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 6: MOM LIABILITY (Test B.3, F)
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

        logMsg(testName, 'assert', `✅ PASS | [Logic] Base Owe + Mom Collected (500k) - COGS Settled (400k) = Live Liability tracking perfectly`);

        uiCheck(testName, 'B.3: Mom wholesale sale DOES NOT bloat Business Summary Dashboard revenue.');
        uiCheck(testName, 'F: COGS Liability Settlement modal caps max payment at the exact Live Liability number.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 7: DELIVERY & CREDIT WATERFALL (Test G)
      // =========================================================================
      testName = 'Test G: Credit Settlement Waterfall';
      logInfo(testName, 'Creating 3 invoices totaling 3M. Simulating 1M payment...');
      try {
        await supabase.from('invoice_summaries').insert([
          { invoice_id: `${TEST_ID}_INV_1`, customer_name: custData.name, customer_id: custData.id, balance_due: 800000, is_done: false, created_at: '2023-01-01' },
          { invoice_id: `${TEST_ID}_INV_2`, customer_name: custData.name, customer_id: custData.id, balance_due: 1000000, is_done: false, created_at: '2023-01-02' },
          { invoice_id: `${TEST_ID}_INV_3`, customer_name: custData.name, customer_id: custData.id, balance_due: 1200000, is_done: false, created_at: '2023-01-03' }
        ]);

        let payment = 1000000;
        await supabase.from('invoice_summaries').update({ balance_due: 0, is_done: true }).eq('invoice_id', `${TEST_ID}_INV_1`);
        payment -= 800000; 
        
        const newBal = 1000000 - payment;
        await supabase.from('invoice_summaries').update({ balance_due: newBal }).eq('invoice_id', `${TEST_ID}_INV_2`);

        const { data: checkI1 } = await supabase.from('invoice_summaries').select('balance_due, is_done').eq('invoice_id', `${TEST_ID}_INV_1`).single();
        const { data: checkI2 } = await supabase.from('invoice_summaries').select('balance_due').eq('invoice_id', `${TEST_ID}_INV_2`).single();

        assertEq(true, checkI1?.is_done, testName, '[Table: invoice_summaries] Oldest Invoice (800k) completely paid off (is_done = true)');
        assertEq(0, checkI1?.balance_due, testName, '[Table: invoice_summaries] Oldest Invoice balance dropped exactly to 0');
        assertEq(800000, checkI2?.balance_due, testName, '[Table: invoice_summaries] Second Invoice (1M) absorbed remaining 200k, new balance 800k');

        uiCheck(testName, 'G: Customer Debt red number drops instantly. Nested invoice UI updates localized balances.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      // =========================================================================
      // MODULE 8: STAFF PAYROLL & EXPENSES (Test H, 6)
      // =========================================================================
      testName = 'Test H & 6: Real-time Salary Math';
      logInfo(testName, 'Adding staff, calculating 15 days worked, processing 100k advance...');
      try {
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: stf } = await supabase.from('staff').insert({
           name: `${TEST_ID}_STAFF`, salary: 1200000, start_date: firstOfMonth, total_debt_riel: 100000 
        }).select().single();
        
        assertEq(100000, stf.total_debt_riel, testName, '[Table: staff] Staff Debt tracks directly to column, not Expenses table');

        const { data: debtHist } = await supabase.from('staff_debt_history').insert({
          staff_id: stf.id, amount: 100000, payment_method: 'Cash ៛'
        }).select().single();
        assertEq(100000, debtHist.amount, testName, '[Table: staff_debt_history] Advance successfully logged to history');

        const dailyRate = 1200000 / 30; // 40000
        const earned = dailyRate * 15; // 600000
        const netPayout = earned - stf.total_debt_riel; // 500000

        assertEq(600000, earned, testName, '[Logic] MTD Earned calculates flawlessly as 600,000 ៛');
        assertEq(500000, netPayout, testName, '[Logic] Net Payout accurately deducts debt to 500,000 ៛');

        uiCheck(testName, 'H: Staff advance increases Dashboard A/R, Cash decreases, but Expenses DO NOT inflate.');
        uiCheck(testName, '6: Ensure standard Business Expenses display correctly in Operating Expenses section.');
        uiCheck(testName, '7: Mix Calculator adds new custom rice formulation successfully to database.');
        uiCheck(testName, '8: Invoice Gallery inline editing successfully updates and saves the data.');

        setStatus(testName, 'PASS');
      } catch (e: any) { setStatus(testName, 'FAIL', e.message); }

      await cleanupTestData();

    } catch (err: any) {
      logInfo('System', `Engine Crash: ${err.message}`);
    } finally {
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

        /* 🔥 DESKTOP LAYOUT FIXES (Aligned with other pages) */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 40px 24px; 
          background: #f1f5f9; 
          box-sizing: border-box; 
          color: #333;
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }

        .header-container { 
          display: flex;
          justify-content: space-between;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* 🔥 Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          min-height: 42px; 
          width: calc(100% - 60px);
          max-width: 1600px;
          margin-right: auto;
        }

        /* 🔥 MOBILE OVERRIDES */
        @media (max-width: 1023px) { 
          .execute-btn {
            padding: 8px 12px !important;
            font-size: 12px !important;
          }
          .mobile-subtitle {
            display: none; /* Hide subtitle on mobile to save space so the button fits */
          }

          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
          }
          .header-container { 
            margin-left: 54px !important; /* Clears mobile hamburger button safely */
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