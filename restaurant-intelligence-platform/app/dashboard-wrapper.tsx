import { DashboardClient } from './dashboard-client';
import { getDashboardData } from './actions';

export default async function DashboardWrapper() {
  const dashboardData = await getDashboardData();
  
  return <DashboardClient initialData={dashboardData} />;
}