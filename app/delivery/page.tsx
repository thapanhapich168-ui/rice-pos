import { Metadata } from 'next';
import DeliveryClient from './DeliveryClient';

export const metadata: Metadata = {
  title: 'Delivery & Credit',
};

export default function Page() {
  return <DeliveryClient />;
}
