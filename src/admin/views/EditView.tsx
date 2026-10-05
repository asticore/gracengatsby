'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface EditViewProps {
	collection: string;
	id: string;
}

export const EditView = ({ collection, id }: EditViewProps) => {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [formData, setFormData] = useState<any>({});

	useEffect(() => {
		fetchData();
	}, [collection, id]);

	const fetchData = async () => {
		try {
			const response = await fetch(`/api/cms/${collection}/${id}`);
			if (!response.ok) {
				throw new Error('Failed to fetch data');
			}
			const result = await response.json();
			setData(result);
			setFormData(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const { name, value } = e.target;
		setFormData({
			...formData,
			[name]: value,
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const response = await fetch(`/api/cms/${collection}/${id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(formData),
			});

			if (!response.ok) {
				throw new Error('Failed to update data');
			}

			router.back();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		}
	};

	if (loading) return <div>Loading...</div>;
	if (error) return <div className="text-red-600">Error: {error}</div>;
	if (!data) return <div>No data found</div>;

	return (
		<div className="p-6">
			<button onClick={() => router.back()} className="mb-4 text-blue-600 hover:underline">
				Back
			</button>

			<h1 className="text-3xl font-bold mb-6">Edit {collection}</h1>

			<form onSubmit={handleSubmit} className="space-y-4">
				{Object.entries(formData).map(([key, value]) => {
					if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
						return null;
					}

					const isLongText = typeof value === 'string' && value.length > 50;

					return (
						<div key={key}>
							<label className="block text-sm font-medium mb-1 capitalize">{key}</label>
							{isLongText ? (
								<textarea
									name={key}
									value={value as string}
									onChange={handleChange}
									className="w-full p-2 border rounded"
									rows={4}
								/>
							) : (
								<input
									type="text"
									name={key}
									value={value as string}
									onChange={handleChange}
									className="w-full p-2 border rounded"
								/>
							)}
						</div>
					);
				})}

				<button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
					Save
				</button>
			</form>
		</div>
	);
};
