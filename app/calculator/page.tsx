import { Metadata } from 'next';
import CalculatorClient from './CalculatorClient';

export const metadata: Metadata = {
  title: 'Mix Calculator',
};

export default function Page() {
  return <CalculatorClient />;
}
