import { test, expect } from '@playwright/test';

test.describe('Rice POS: Full Lifecycle (Create, Import, Link, Pull, Sell)', () => {
  
  test('Complete 360 Flow', async ({ page }) => {
    // Generate unique names so the test never fails due to duplicate data
    const timestamp = Date.now();
    const wholesaleName = `Auto Whole ${timestamp}`;
    const retailName = `Auto Ret ${timestamp}`;
    const supplierName = `Auto Sup ${timestamp}`;

    // ==========================================
    // 1. LOGIN & NAVIGATE TO INVENTORY
    // ==========================================
    // 🛡️ ROUTING FIX: Navigating to the actual /rice folder
    await page.goto('http://localhost:3000/rice', { timeout: 60000 });

    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible()) {
      await page.locator('input[type="email"], input[type="text"]').first().fill('sengvannjing11@gmail.com'); 
      await passwordInput.fill('Vannjing9');
      await page.getByRole('button', { name: /Login/i }).click();
      await page.waitForURL('**/rice', { timeout: 15000 });
    }

    // ==========================================
    // 2. CREATE WHOLESALE PRODUCT (50kg)
    // ==========================================
    await page.getByRole('button', { name: '+ Add Product' }).click();
    await page.getByText('Product Name').locator('..').locator('input').fill(wholesaleName);
    await page.getByText('Selling Price (៛)').locator('..').locator('input').fill('120000');
    await page.getByText('Cost Price (៛)').locator('..').locator('input').fill('100000');
    await page.getByText('Weight (kg)').locator('..').locator('input').fill('50');
    await page.getByText('Initial Stock').locator('..').locator('input').fill('0');
    await page.getByRole('button', { name: 'Save Product' }).click();
    await expect(page.getByText('Product Created')).toBeVisible();

    // ==========================================
    // 3. CREATE RETAIL PRODUCT (1kg)
    // ==========================================
    await page.getByRole('button', { name: '+ Add Product' }).click();
    await page.getByText('Product Name').locator('..').locator('input').fill(retailName);
    await page.getByText('Selling Price (៛)').locator('..').locator('input').fill('3000');
    await page.getByText('Cost Price (៛)').locator('..').locator('input').fill('2000');
    await page.getByText('Weight (kg)').locator('..').locator('input').fill('1');
    await page.getByText('Initial Stock').locator('..').locator('input').fill('0');
    await page.getByRole('button', { name: 'Save Product' }).click();
    await expect(page.getByText('Product Created')).toBeVisible();

    // ==========================================
    // 4. LINK RETAIL TO WHOLESALE BAG
    // ==========================================
    await page.getByRole('button', { name: '🛍️ Retail' }).click();
    await page.getByPlaceholder(/Quick search/i).fill(retailName);
    
    // Click the "Link Wholesale Bag" dropdown on the new retail item
    await page.getByText('🔍 Click to link Wholesale Bag...').first().click();
    
    // Search for the wholesale bag we just made and click it
    const dropdownSearch = page.getByPlaceholder('Search Wholesale bag...');
    await dropdownSearch.fill(wholesaleName);
    await page.locator('.dropdown-row').filter({ hasText: wholesaleName }).click();
    
    // Verify it linked successfully
    await expect(page.getByText(`🌾 ${wholesaleName}`)).toBeVisible();

    // ==========================================
    // 5. CREATE SUPPLIER & IMPORT 10 BAGS
    // ==========================================
    await page.getByRole('button', { name: '🚚 Receive Stock' }).click();
    
    // Add Supplier
    await page.getByRole('button', { name: '+ Add New Supplier' }).click();
    await page.getByText('Supplier Name').locator('..').locator('input').fill(supplierName);
    await page.getByRole('button', { name: 'Save Supplier' }).click();
    await expect(page.getByText('Supplier Added')).toBeVisible();

    // Select Product
    await page.getByText('-- Choose Rice Type --').click();
    await page.locator('.saas-card input[placeholder="Search..."]').last().fill(wholesaleName);
    await page.locator('.dropdown-row').filter({ hasText: wholesaleName }).click();

    // Fill Import Details
    await page.getByText('Quantity Imported').locator('..').locator('input').fill('10');
    await page.getByText('Unit Cost (៛)').locator('..').locator('input').fill('100000');
    await page.getByText('Amount Paying Now (៛)').locator('..').locator('input').fill('1000000'); // Pay in full

    await page.getByRole('button', { name: '✅ Paid Full & Import' }).click();
    await expect(page.getByText('Stock Received')).toBeVisible();

    // ==========================================
    // 6. GO TO POS & PULL/SELL RETAIL STOCK
    // ==========================================
    await page.goto('http://localhost:3000/pos');
    await expect(page.getByRole('heading', { name: /Point of Sales|អង្គរ រេឌឌៀន រ៉ាយស៍/i })).toBeVisible();

    await page.getByRole('button', { name: /Retail/i }).click();
    await page.getByPlaceholder(/Search/i).first().fill(retailName);

    // The item has 0 stock. Clicking it will trigger the "Auto-Open" sequence
    const retailCard = page.locator('.saas-card').filter({ hasText: retailName }).first();
    await retailCard.click();

    // Confirm the Auto-Open Bag modal
    const autoOpenModal = page.getByText('Auto-Open Bag Required');
    await expect(autoOpenModal).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Open Bag' }).click();
    
    // Wait for the math to process and the modal to close
    await expect(autoOpenModal).not.toBeVisible();

    // Now that we have 50kg in stock, click it again to actually add it to the cart
    await retailCard.click();

    // Handle Mobile View UI (if Playwright runs in a smaller viewport)
    const mobilePopup = page.getByText('Adjust Item Properties');
    if (await mobilePopup.isVisible()) {
        await page.getByRole('button', { name: 'Add to Cart' }).click();
    }

    // Checkout
    await expect(page.getByText(/Shopping Cart/i)).toBeVisible();
    await page.getByRole('button', { name: /Checkout/i }).click();
    
    // Verify final success screen
    await expect(page.getByText(/Sale Complete!|Sale Recorded!/i)).toBeVisible();
  });

});