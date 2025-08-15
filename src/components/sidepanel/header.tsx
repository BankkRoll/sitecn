const Header = ({ headTitle }: { headTitle: string }) => {
  return (
    <div className="flex capitalize justify-start w-full h-[40px] border-b-[1px] p-4 bg-background text-foreground text-2xl items-center font-bold">
      {headTitle}
    </div>
  );
};

export default Header;
