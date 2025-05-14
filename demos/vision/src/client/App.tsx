import React, { useState, useCallback } from "react";
import "./App.css";

function App() {
	const [isDragging, setIsDragging] = useState(false);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [analysis, setAnalysis] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const analyzeImage = async (file: File) => {
		setIsLoading(true);
		setError(null);
		setAnalysis(null);

		try {
			const formData = new FormData();
			formData.append("image", file);

			const response = await fetch("/analyze", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to analyze image");
			}

			setAnalysis(data.analysis);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);

		const file = e.dataTransfer.files[0];
		if (file && file.type.startsWith("image/")) {
			const reader = new FileReader();
			reader.onload = (event) => {
				setSelectedImage(event.target?.result as string);
				analyzeImage(file);
			};
			reader.readAsDataURL(file);
		}
	}, []);

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (event) => {
					setSelectedImage(event.target?.result as string);
					analyzeImage(file);
				};
				reader.readAsDataURL(file);
			}
		},
		[],
	);

	return (
		<div className="app">
			<h1>Image Analysis</h1>
			<div
				className={`drop-zone ${isDragging ? "dragging" : ""}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{selectedImage ? (
					<div className="image-preview">
						<img src={selectedImage} alt="Selected" />
						<button
							onClick={() => {
								setSelectedImage(null);
								setAnalysis(null);
								setError(null);
							}}
						>
							Remove
						</button>
					</div>
				) : (
					<>
						<p>Drag and drop an image here</p>
						<p>or</p>
						<input
							type="file"
							accept="image/*"
							onChange={handleFileInput}
							id="file-input"
						/>
						<label htmlFor="file-input" className="upload-button">
							Choose a file
						</label>
					</>
				)}
			</div>

			{isLoading && <div className="loading">Analyzing image...</div>}

			{error && <div className="error">{error}</div>}

			{analysis && (
				<div className="analysis">
					<h2>Analysis Result</h2>
					<p>{analysis}</p>
				</div>
			)}
		</div>
	);
}

export default App;
