import { Metadata } from 'next';
import ReportClient from './ReportClient';

export const metadata: Metadata = {
  title: 'Report',
};

export default function Page() {
  return <ReportClient />;
}
