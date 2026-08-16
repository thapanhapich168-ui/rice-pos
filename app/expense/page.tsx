import { Metadata } from 'next';
import ExpenseClient from './ExpenseClient';

export const metadata: Metadata = {
  title: 'Expenses and Staffs',
};

export default function Page() {
  return <ExpenseClient />;
}
