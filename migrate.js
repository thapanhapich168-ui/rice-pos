const fs = require('fs');
const path = require('path');

const pages = [
  { folder: 'bizdatabase', client: 'BizDatabaseClient', title: 'Master Biz Database' },
  { folder: 'calculator', client: 'CalculatorClient', title: 'Mix Calculator' },
  { folder: 'cogs-report', client: 'CogsReportClient', title: 'COGS Accounting' },
  { folder: 'customerdatabase', client: 'CustomerDatabaseClient', title: 'Customer Database' },
  { folder: 'dashboard', client: 'DashboardClient', title: 'Dashboard' },
  { folder: 'delivery', client: 'DeliveryClient', title: 'Delivery & Credit' },
  { folder: 'dev-test', client: 'DevTestClient', title: 'Dev Test' },
  { folder: 'expense', client: 'ExpenseClient', title: 'Expenses and Staffs' },
  { folder: 'forgot-password', client: 'ForgotPasswordClient', title: 'Forgot Password' },
  { folder: 'invoices', client: 'InvoicesClient', title: 'Invoice Gallery' },
  { folder: 'pos', client: 'PosClient', title: 'POS System' },
  { folder: 'report', client: 'ReportClient', title: 'Report' },
  { folder: 'rice', client: 'RiceClient', title: 'Rice Control' },
  { folder: 'settings', client: 'SettingsClient', title: 'Settings' },
  { folder: 'update-password', client: 'UpdatePasswordClient', title: 'Update Password' }
];

pages.forEach(({ folder, client, title }) => {
  const dir = path.join(__dirname, 'app', folder);
  const oldPagePath = path.join(dir, 'page.tsx');
  const newClientPath = path.join(dir, `${client}.tsx`);
  const newPagePath = path.join(dir, 'page.tsx');

  // Create folder if it doesn't exist just in case
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. Rename existing page.tsx to [PageName]Client.tsx
  if (fs.existsSync(oldPagePath)) {
    fs.renameSync(oldPagePath, newClientPath);
    console.log(`✅ Renamed: app/${folder}/page.tsx -> ${client}.tsx`);
  }

  // 2. Generate the new Server page.tsx with exact Metadata
  const serverCode = `import { Metadata } from 'next';
import ${client} from './${client}';

export const metadata: Metadata = {
  title: '${title}',
};

export default function Page() {
  return <${client} />;
}
`;

  // Write the new file
  fs.writeFileSync(newPagePath, serverCode);
  console.log(`✨ Created: app/${folder}/page.tsx`);
});

console.log('\n🎉 ALL DONE! Just delete the old useEffects inside your new Client files.');