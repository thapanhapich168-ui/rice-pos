import { Metadata } from 'next';
import UpdatePasswordClient from './UpdatePasswordClient';

export const metadata: Metadata = {
  title: 'Update Password',
};

export default function Page() {
  return <UpdatePasswordClient />;
}
