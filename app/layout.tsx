import type { Metadata } from 'next';
import './globals.css';
import './accessibility.css';
export const metadata:Metadata={title:'DukaTrack — Business workspace',description:'Sales, stock and customer credit. A simpler way to run your business.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icons/apple-touch-icon.png'},appleWebApp:{capable:true,title:'DukaTrack',statusBarStyle:'default'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
