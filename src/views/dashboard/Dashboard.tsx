'use client';

import { getDatabase } from '@/cms/db';
import { getGettingStartedTasks } from '@/cms/db';
import { getOrInsertUser } from '@/features/auth/getOrInsertUser';
import { GettingStartedCard } from '@/features/gettingStarted/GettingStartedCard';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEffect, useState } from 'react';

export const Dashboard = async () => {
	const { user } = useAuth();

	if (!user) {
		return <div>Loading...</div>;
	}

	// Get or create user record
	const dbUser = await getOrInsertUser(user.id, user.email);

	// Get all getting started tasks
	const tasks = await getGettingStartedTasks();

	// Count completed tasks for this user
	const completedTasks = tasks.filter((task) => dbUser.completedTasks?.includes(task.id));

	return (
		<div className="p-6">
			<h1 className="text-3xl font-bold mb-6">Dashboard</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div className="bg-white rounded-lg shadow p-6">
					<h2 className="text-xl font-semibold mb-4">Welcome {dbUser.username || user.email}!</h2>
					<p className="text-gray-600 mb-4">You have completed {completedTasks.length} of {tasks.length} getting started tasks.</p>
					<div className="w-full bg-gray-200 rounded-full h-2.5">
						<div
							className="bg-blue-600 h-2.5 rounded-full"
							style={{
								width: `${tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0}%`,
							}}
						></div>
					</div>
				</div>

				<GettingStartedCard tasks={tasks} dbUser={dbUser} />
			</div>
		</div>
	);
};
