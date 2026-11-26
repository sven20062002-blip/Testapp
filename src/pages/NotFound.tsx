import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Empty } from '@/components/ui/Empty';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  const nav = useNavigate();
  return (
    <div className="page">
      <Empty
        icon={<Compass size={28} />}
        title="Seite nicht gefunden"
        text="Diese Seite existiert nicht (mehr)."
        action={
          <Button variant="primary" onClick={() => nav('/')}>
            Zum Start
          </Button>
        }
      />
    </div>
  );
}
